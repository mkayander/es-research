import { spawn } from "child_process";
import { config } from "./config.js";
import { sleep } from "./utils.js";
import type { GitHubRepository } from "./github-client.js";

export interface ESGuardIssue {
  category?: string;
  severity?: "error" | "warning" | "info";
  type?: string;
  message?: string;
  line?: number;
  column?: number;
}

export interface ESGuardResult {
  issues: ESGuardIssue[];
}

export interface FileAnalysisResult {
  filePath: string;
  hasIssues: boolean;
  issues: ESGuardIssue[];
  summary: IssueSummary;
  timestamp: string;
  error?: string;
}

export interface IssueSummary {
  total: number;
  categories: Record<string, number>;
  severity: {
    error: number;
    warning: number;
    info: number;
  };
}

export interface FileToAnalyze {
  path: string;
  content: string;
}

export interface ProjectAnalysisResult {
  project: {
    id: number;
    full_name: string;
    name: string;
    description: string | null;
    stargazers_count: number;
    forks_count: number;
    language: string | null;
    created_at: string;
    updated_at: string;
  };
  analysis: {
    totalFiles: number;
    analyzedFiles: number;
    filesWithIssues: number;
    totalIssues: number;
    duration: number;
    timestamp: string;
  };
  results: FileAnalysisResult[];
  statistics: ProjectStatistics;
}

export interface ProjectStatistics {
  totalFiles: number;
  filesWithIssues: number;
  totalIssues: number;
  categories: Record<string, number>;
  severity: {
    error: number;
    warning: number;
    info: number;
  };
  issueTypes: Record<string, number>;
}

export class ESGuardAnalyzer {
  private timeout: number;

  constructor() {
    this.timeout = config.analysis.analysisTimeout;
  }

  /**
   * Analyze a JavaScript file using es-guard
   */
  async analyzeFile(
    filePath: string,
    content: string
  ): Promise<FileAnalysisResult> {
    try {
      const result = await this.runESGuard(content);

      return {
        filePath,
        hasIssues: result.issues.length > 0,
        issues: result.issues,
        summary: this.summarizeIssues(result.issues),
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        filePath,
        hasIssues: false,
        error: (error as Error).message,
        issues: [],
        summary: {
          total: 0,
          categories: {},
          severity: { error: 0, warning: 0, info: 0 },
        },
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Run es-guard on content
   */
  async runESGuard(content: string): Promise<ESGuardResult> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        child.kill("SIGTERM");
        reject(new Error("Analysis timeout"));
      }, this.timeout);

      const child = spawn("npx", ["es-guard", "--json"], {
        stdio: ["pipe", "pipe", "pipe"],
        shell: true,
      });

      let stdout = "";
      let stderr = "";

      child.stdout.on("data", (data) => {
        stdout += data.toString();
      });

      child.stderr.on("data", (data) => {
        stderr += data.toString();
      });

      child.on("close", (code) => {
        clearTimeout(timeout);

        if (code !== 0) {
          reject(new Error(`es-guard failed with code ${code}: ${stderr}`));
          return;
        }

        try {
          const result = JSON.parse(stdout) as ESGuardResult;
          resolve(result);
        } catch (error) {
          reject(
            new Error(
              `Failed to parse es-guard output: ${(error as Error).message}`
            )
          );
        }
      });

      child.on("error", (error) => {
        clearTimeout(timeout);
        reject(error);
      });

      // Send content to es-guard
      child.stdin.write(content);
      child.stdin.end();
    });
  }

  /**
   * Summarize issues by category
   */
  summarizeIssues(issues: ESGuardIssue[]): IssueSummary {
    const summary: IssueSummary = {
      total: issues.length,
      categories: {},
      severity: {
        error: 0,
        warning: 0,
        info: 0,
      },
    };

    for (const issue of issues) {
      // Count by category
      const category = issue.category || "unknown";
      summary.categories[category] = (summary.categories[category] || 0) + 1;

      // Count by severity
      const severity = issue.severity || "info";
      summary.severity[severity] = (summary.severity[severity] || 0) + 1;
    }

    return summary;
  }

  /**
   * Analyze multiple files with concurrency control
   */
  async analyzeFiles(
    files: FileToAnalyze[],
    concurrency = config.analysis.concurrency
  ): Promise<FileAnalysisResult[]> {
    const results: FileAnalysisResult[] = [];
    const queue = [...files];
    const running = new Set<FileToAnalyze>();

    const processFile = async (file: FileToAnalyze) => {
      try {
        const result = await this.analyzeFile(file.path, file.content);
        results.push(result);
      } catch (error) {
        results.push({
          filePath: file.path,
          hasIssues: false,
          error: (error as Error).message,
          issues: [],
          summary: {
            total: 0,
            categories: {},
            severity: { error: 0, warning: 0, info: 0 },
          },
          timestamp: new Date().toISOString(),
        });
      } finally {
        running.delete(file);
      }
    };

    while (queue.length > 0 || running.size > 0) {
      // Start new tasks up to concurrency limit
      while (running.size < concurrency && queue.length > 0) {
        const file = queue.shift()!;
        running.add(file);
        processFile(file);
      }

      // Wait a bit before checking again
      await sleep(100);
    }

    return results;
  }

  /**
   * Analyze a project's files
   */
  async analyzeProject(
    project: GitHubRepository,
    files: FileToAnalyze[]
  ): Promise<ProjectAnalysisResult> {
    const startTime = Date.now();

    console.log(
      `Analyzing ${files.length} files for project: ${project.full_name}`
    );

    const results = await this.analyzeFiles(files);

    const endTime = Date.now();
    const duration = endTime - startTime;

    // Aggregate project-level statistics
    const projectStats = this.aggregateProjectStats(results);

    return {
      project: {
        id: project.id,
        full_name: project.full_name,
        name: project.name,
        description: project.description,
        stargazers_count: project.stargazers_count,
        forks_count: project.forks_count,
        language: project.language,
        created_at: project.created_at,
        updated_at: project.updated_at,
      },
      analysis: {
        totalFiles: files.length,
        analyzedFiles: results.length,
        filesWithIssues: results.filter((r) => r.hasIssues).length,
        totalIssues: results.reduce(
          (sum, r) => sum + (r.summary?.total || 0),
          0
        ),
        duration,
        timestamp: new Date().toISOString(),
      },
      results,
      statistics: projectStats,
    };
  }

  /**
   * Aggregate statistics across all files in a project
   */
  aggregateProjectStats(results: FileAnalysisResult[]): ProjectStatistics {
    const stats: ProjectStatistics = {
      totalFiles: results.length,
      filesWithIssues: 0,
      totalIssues: 0,
      categories: {},
      severity: {
        error: 0,
        warning: 0,
        info: 0,
      },
      issueTypes: {},
    };

    for (const result of results) {
      if (result.hasIssues) {
        stats.filesWithIssues++;
      }

      if (result.summary) {
        stats.totalIssues += result.summary.total;

        // Aggregate categories
        for (const [category, count] of Object.entries(
          result.summary.categories
        )) {
          stats.categories[category] =
            (stats.categories[category] || 0) + count;
        }

        // Aggregate severity
        for (const [severity, count] of Object.entries(
          result.summary.severity
        )) {
          stats.severity[severity as keyof typeof stats.severity] =
            (stats.severity[severity as keyof typeof stats.severity] || 0) +
            count;
        }
      }

      // Aggregate issue types
      for (const issue of result.issues) {
        const type = issue.type || "unknown";
        stats.issueTypes[type] = (stats.issueTypes[type] || 0) + 1;
      }
    }

    return stats;
  }

  /**
   * Check if es-guard is available
   */
  async checkESGuardAvailability(): Promise<boolean> {
    try {
      await this.runESGuard('console.log("test");');
      return true;
    } catch (error) {
      console.error("es-guard is not available:", (error as Error).message);
      return false;
    }
  }
}
