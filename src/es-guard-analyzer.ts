import { runESGuard, type Violation } from "es-guard";
import type { GitHubRepository } from "./github-client.js";

export interface ResearchResult {
  issues: Violation[];
}

export interface IssueSummary {
  total: number;
  categories: Record<string, number>;
  severity: {
    error: number;
    warning: number;
    info: number;
  };
  issueTypes: Record<string, number>;
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
    duration: number;
    timestamp: string;
  };
  results: {
    success: boolean;
    errors: Violation[];
    warnings: Violation[];
    scanDirectory: string;
    target: string;
    browserTargets: string;
  };
  statistics: {
    categories: Record<string, number>;
    severity: {
      error: number;
      warning: number;
      info: number;
    };
    issueTypes: Record<string, number>;
  };
}

export class ESGuardAnalyzer {
  /**
   * Summarize issues by category and severity
   */
  summarizeIssues(issues: Violation[]): IssueSummary {
    const summary: IssueSummary = {
      total: issues.length,
      categories: {},
      severity: {
        error: 0,
        warning: 0,
        info: 0,
      },
      issueTypes: {},
    };

    for (const issue of issues) {
      // Count by file category (extract file extension or directory)
      const filePath = issue.file;
      const category = this.extractCategory(filePath);
      summary.categories[category] = (summary.categories[category] ?? 0) + 1;

      // Count by severity from messages
      for (const message of issue.messages) {
        const severity = this.mapSeverity(message.severity);
        summary.severity[severity] = summary.severity[severity] + 1;

        // Count by rule type
        const ruleId = message.ruleId ?? "unknown";
        summary.issueTypes[ruleId] = (summary.issueTypes[ruleId] ?? 0) + 1;
      }
    }

    return summary;
  }

  /**
   * Extract category from file path
   */
  private extractCategory(filePath: string): string {
    const ext = filePath.split(".").pop()?.toLowerCase() ?? "unknown";
    if (ext === "js" || ext === "mjs") return "javascript";
    if (ext === "ts" || ext === "tsx") return "typescript";
    if (ext === "jsx") return "jsx";
    if (ext === "json") return "json";
    if (ext === "html") return "html";
    if (ext === "css") return "css";
    return ext;
  }

  /**
   * Map ESLint severity to our categories
   */
  private mapSeverity(severity: number): "error" | "warning" | "info" {
    switch (severity) {
      case 2:
        return "error";
      case 1:
        return "warning";
      case 0:
        return "info";
      default:
        return "warning";
    }
  }

  /**
   * Aggregate project-level statistics from ESGuard results
   */
  private aggregateProjectStats(results: {
    success: boolean;
    errors: Violation[];
    warnings: Violation[];
    scanDirectory: string;
    target: string;
    browserTargets: string;
  }) {
    const allIssues = [...results.errors, ...results.warnings];
    return this.summarizeIssues(allIssues);
  }

  /**
   * Check if es-guard is available and working
   */
  async checkESGuardAvailability(): Promise<boolean> {
    try {
      // Try to import and check if es-guard is available
      const esGuardModule = await import("es-guard");
      return typeof esGuardModule.runESGuard === "function";
    } catch {
      return false;
    }
  }

  /**
   * Analyze a project's files
   *
   * Main logic:
   * - Run ESGuard analysis on the project
   * - Aggregate project-level statistics
   * - Return analysis result
   */
  async analyzeProject(
    project: GitHubRepository,
    tempDir: string
  ): Promise<ProjectAnalysisResult> {
    const startTime = Date.now();

    const results = await runESGuard({ workingDir: tempDir });

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
        duration,
        timestamp: new Date().toISOString(),
      },
      results,
      statistics: projectStats,
    };
  }
}
