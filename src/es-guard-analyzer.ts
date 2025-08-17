import {
  checkCompatibility,
  detectProjectConfig,
  getBrowserTargetsFromString,
  validateConfig,
  type Config,
  type CompatibilityResult,
  type DetectionResult,
} from "es-guard";
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
  file?: string;
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
    clone_url: string;
    default_branch: string;
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
  private defaultConfig: Config;

  constructor() {
    this.timeout = config.analysis.analysisTimeout;
    this.defaultConfig = {
      dir: "temp", // Will be overridden for individual files
      target: "2020",
      browsers: "> 1%, last 2 versions, not dead",
    };
  }

  /**
   * Analyze a JavaScript file using es-guard programmatic API
   *
   * Main logic:
   * - Run es-guard on file content
   * - Convert result to our format
   * - Summarize issues
   * - Return analysis result
   */
  async analyzeFile(
    filePath: string,
    content: string
  ): Promise<FileAnalysisResult> {
    try {
      const result = await this.runESGuard(filePath, content);

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
   * Run es-guard programmatically on content
   */
  async runESGuard(filePath: string, content: string): Promise<ESGuardResult> {
    // Create a temporary file-like structure for analysis
    const tempDir = `temp_${Date.now()}`;
    const fileName = filePath.split("/").pop() ?? "file.js";

    // Use a timeout wrapper for the analysis
    const analysisPromise = this.performAnalysis(tempDir, fileName, content);

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error("Analysis timeout"));
      }, this.timeout);
    });

    try {
      const compatibilityResult = await Promise.race([
        analysisPromise,
        timeoutPromise,
      ]);
      return this.convertCompatibilityResult(compatibilityResult, filePath);
    } catch (error) {
      throw new Error(`ES-Guard analysis failed: ${(error as Error).message}`);
    }
  }

  /**
   * Perform the actual es-guard analysis
   */
  private async performAnalysis(
    tempDir: string,
    fileName: string,
    content: string
  ): Promise<CompatibilityResult> {
    // Create a virtual file system approach by writing content to a temporary location
    // For now, we'll use a simplified approach that works with the programmatic API
    const config: Config = {
      ...this.defaultConfig,
      dir: tempDir,
    };

    // Since es-guard programmatic API expects files on disk, we'll use a different approach
    // We'll create a temporary file and analyze it
    const fs = await import("fs/promises");
    const path = await import("path");

    try {
      // Create temp directory
      await fs.mkdir(tempDir, { recursive: true });

      // Write content to temp file
      const tempFilePath = path.join(tempDir, fileName);
      await fs.writeFile(tempFilePath, content, "utf8");

      // Run es-guard analysis
      const result = await checkCompatibility(config);

      // Clean up temp directory
      await fs.rm(tempDir, { recursive: true, force: true });

      return result;
    } catch (error) {
      // Clean up on error
      try {
        await fs.rm(tempDir, { recursive: true, force: true });
      } catch (_cleanupError) {
        console.warn("Error cleaning up temp directory:", _cleanupError);
        // Ignore cleanup errors
      }
      throw error;
    }
  }

  /**
   * Convert es-guard CompatibilityResult to our ESGuardResult format
   */
  private convertCompatibilityResult(
    compatibilityResult: CompatibilityResult,
    filePath: string
  ): ESGuardResult {
    const issues: ESGuardIssue[] = [];

    // Convert errors
    for (const violation of compatibilityResult.errors) {
      for (const message of violation.messages) {
        issues.push({
          category: "compatibility",
          severity: "error",
          message: message.message,
          line: message.line,
          column: message.column,
          file: filePath,
        });
      }
    }

    // Convert warnings
    for (const violation of compatibilityResult.warnings) {
      for (const message of violation.messages) {
        issues.push({
          category: "compatibility",
          severity: "warning",
          message: message.message,
          line: message.line,
          column: message.column,
          file: filePath,
        });
      }
    }

    return { issues };
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
      const category = issue.category ?? "unknown";
      summary.categories[category] = (summary.categories[category] ?? 0) + 1;

      // Count by severity
      const severity = issue.severity ?? "info";
      summary.severity[severity] = summary.severity[severity] + 1;
    }

    return summary;
  }

  /**
   * Analyze multiple files with concurrency control
   *
   * Main logic:
   * - Process files with concurrency limit
   * - Aggregate results
   * - Return analysis results
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
        const file = queue.shift();
        if (file) {
          running.add(file);
          void processFile(file);
        }
      }

      // Wait a bit before checking again
      await sleep(100);
    }

    return results;
  }

  /**
   * Analyze a project's files
   *
   * Main logic:
   * - Analyze files with concurrency control
   * - Aggregate project-level statistics
   * - Return analysis result
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
        clone_url: project.clone_url,
        default_branch: project.default_branch,
      },
      analysis: {
        totalFiles: files.length,
        analyzedFiles: results.length,
        filesWithIssues: results.filter((r) => r.hasIssues).length,
        totalIssues: results.reduce((sum, r) => sum + r.summary.total, 0),
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

      stats.totalIssues += result.summary.total;

      // Aggregate categories
      for (const [category, count] of Object.entries(
        result.summary.categories
      )) {
        stats.categories[category] = (stats.categories[category] ?? 0) + count;
      }

      // Aggregate severity
      for (const [severity, count] of Object.entries(result.summary.severity)) {
        const severityKey = severity as keyof typeof stats.severity;
        stats.severity[severityKey] += count;
      }

      // Aggregate issue types
      for (const issue of result.issues) {
        const type = issue.type ?? "unknown";
        stats.issueTypes[type] = (stats.issueTypes[type] ?? 0) + 1;
      }
    }

    return stats;
  }

  /**
   * Check if es-guard is available using programmatic API
   */
  checkESGuardAvailability(): boolean {
    try {
      // Test with a simple configuration validation
      const testConfig: Config = {
        dir: "test",
        target: "2020",
      };

      validateConfig(testConfig);

      // Test browser targets function
      getBrowserTargetsFromString("2020");

      return true;
    } catch (error) {
      console.error("es-guard is not available:", (error as Error).message);
      return false;
    }
  }

  /**
   * Get project configuration using es-guard's auto-detection
   */
  detectProjectConfiguration(projectPath: string): DetectionResult | null {
    try {
      const detectedConfig = detectProjectConfig(projectPath);

      return detectedConfig;
    } catch (error) {
      console.error(
        "Failed to detect project configuration:",
        (error as Error).message
      );
      return null;
    }
  }

  /**
   * Analyze with custom configuration
   */
  async analyzeWithCustomConfig(
    filePath: string,
    content: string,
    customConfig: Config
  ): Promise<FileAnalysisResult> {
    try {
      // Validate the custom configuration
      validateConfig(customConfig);

      // Perform analysis with custom config
      const tempDir = `temp_${Date.now()}`;
      const fileName = filePath.split("/").pop() ?? "file.js";

      const fs = await import("fs/promises");
      const path = await import("path");

      try {
        await fs.mkdir(tempDir, { recursive: true });
        const tempFilePath = path.join(tempDir, fileName);
        await fs.writeFile(tempFilePath, content, "utf8");

        const result = await checkCompatibility({
          ...customConfig,
          dir: tempDir,
        });

        await fs.rm(tempDir, { recursive: true, force: true });

        const convertedResult = this.convertCompatibilityResult(
          result,
          filePath
        );

        return {
          filePath,
          hasIssues: convertedResult.issues.length > 0,
          issues: convertedResult.issues,
          summary: this.summarizeIssues(convertedResult.issues),
          timestamp: new Date().toISOString(),
        };
      } catch (error) {
        try {
          await fs.rm(tempDir, { recursive: true, force: true });
        } catch (cleanupError) {
          console.warn("Error cleaning up temp directory:", cleanupError);
          // Ignore cleanup errors
        }
        throw error;
      }
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
}
