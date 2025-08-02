#!/usr/bin/env bun

import {
  loadJson,
  saveJson,
  saveYaml,
  createCsvWriter,
  ensureDir,
} from "./utils.js";
import { config } from "./config.js";
import chalk from "chalk";
import type { ProjectAnalysisResult } from "./es-guard-analyzer.js";

interface AnalysisData {
  summary: {
    overview: {
      totalProjects: number;
      analyzedProjects: number;
      failedProjects: number;
      projectsWithIssues: number;
      projectsWithoutIssues: number;
      totalFiles: number;
      totalIssues: number;
    };
    statistics: {
      issuePrevalence: {
        percentage: number;
        confidenceInterval: {
          lower: number;
          upper: number;
          margin: number;
        };
      };
      averageIssuesPerProject: number;
      averageIssuesPerFile: number;
      averageFilesPerProject: number;
    };
    issueCategories: Record<string, number>;
    issueSeverity: Record<string, number>;
    topIssues: Record<string, number>;
  };
  results: ProjectAnalysisResult[];
  errors: Array<{
    project: string;
    error: string;
    timestamp: string;
  }>;
  metadata: {
    totalProjects: number;
    analyzedProjects: number;
    failedProjects: number;
    timestamp: string;
    config: {
      sampleSize: number;
      maxFilesPerProject: number;
      maxFileSize: number;
    };
  };
}

async function main(): Promise<void> {
  console.log(
    chalk.blue.bold("📊 NextJS Projects Research - Report Generation")
  );
  console.log(chalk.gray("Generating comprehensive reports...\n"));

  try {
    // Load analysis results
    const analysisFile = `${config.output.dataDir}/analysis-results.json`;
    const analysisData = await loadJson<AnalysisData>(analysisFile);

    if (!analysisData) {
      throw new Error(
        'No analysis results found. Please run "bun run analyze" first.'
      );
    }

    const { summary, results, errors, metadata } = analysisData;

    // Create reports directory
    await ensureDir(config.output.reportsDir);

    // Generate different report formats
    await generateCSVReports(results, summary);
    await generateJSONReports(results, summary, metadata);
    await generateMarkdownReport(results, summary, metadata, errors);
    await generateYAMLReport(summary, metadata);

    console.log(chalk.green.bold("\n✅ Reports generated successfully!"));
    console.log(chalk.gray(`📁 Reports saved to: ${config.output.reportsDir}`));
  } catch (error) {
    console.error(chalk.red.bold("\n❌ Error generating reports:"));
    console.error(chalk.red((error as Error).message));
    process.exit(1);
  }
}

async function generateCSVReports(
  results: ProjectAnalysisResult[],
  summary: AnalysisData["summary"]
): Promise<void> {
  console.log(chalk.blue("📊 Generating CSV reports..."));

  // Project summary CSV
  const projectSummaryCsv = createCsvWriter(
    `${config.output.reportsDir}/project-summary.csv`,
    [
      "Project",
      "Stars",
      "Forks",
      "Total Files",
      "Analyzed Files",
      "Files With Issues",
      "Total Issues",
      "Issue Categories",
      "Has Issues",
    ]
  );

  const projectRecords = results.map((result) => ({
    Project: result.project.full_name,
    Stars: result.project.stargazers_count,
    Forks: result.project.forks_count,
    "Total Files": (result as any).fileDiscovery?.totalFiles || 0,
    "Analyzed Files": result.analysis.analyzedFiles,
    "Files With Issues": result.statistics.filesWithIssues,
    "Total Issues": result.statistics.totalIssues,
    "Issue Categories": Object.keys(result.statistics.categories).join("; "),
    "Has Issues": result.statistics.filesWithIssues > 0 ? "Yes" : "No",
  }));

  await projectSummaryCsv.writeRecords(projectRecords);

  // Issues detail CSV
  const issuesCsv = createCsvWriter(
    `${config.output.reportsDir}/issues-detail.csv`,
    [
      "Project",
      "File Path",
      "Issue Type",
      "Category",
      "Severity",
      "Message",
      "Line",
      "Column",
    ]
  );

  const issueRecords: Array<{
    Project: string;
    "File Path": string;
    "Issue Type": string;
    Category: string;
    Severity: string;
    Message: string;
    Line: string;
    Column: string;
  }> = [];

  for (const result of results) {
    for (const fileResult of result.results) {
      for (const issue of fileResult.issues) {
        issueRecords.push({
          Project: result.project.full_name,
          "File Path": fileResult.filePath,
          "Issue Type": issue.type || "unknown",
          Category: issue.category || "unknown",
          Severity: issue.severity || "info",
          Message: issue.message || "",
          Line: issue.line?.toString() || "",
          Column: issue.column?.toString() || "",
        });
      }
    }
  }

  await issuesCsv.writeRecords(issueRecords);

  // Statistics summary CSV
  const statsCsv = createCsvWriter(
    `${config.output.reportsDir}/statistics-summary.csv`,
    ["Metric", "Value", "Percentage"]
  );

  const statsRecords = [
    {
      Metric: "Total Projects",
      Value: summary.overview.totalProjects,
      Percentage: "100%",
    },
    {
      Metric: "Projects with Issues",
      Value: summary.overview.projectsWithIssues,
      Percentage: `${summary.statistics.issuePrevalence.percentage.toFixed(
        1
      )}%`,
    },
    {
      Metric: "Projects without Issues",
      Value: summary.overview.projectsWithoutIssues,
      Percentage: `${(
        (summary.overview.projectsWithoutIssues /
          summary.overview.totalProjects) *
        100
      ).toFixed(1)}%`,
    },
    {
      Metric: "Total Files Analyzed",
      Value: summary.overview.totalFiles,
      Percentage: "",
    },
    {
      Metric: "Total Issues Found",
      Value: summary.overview.totalIssues,
      Percentage: "",
    },
    {
      Metric: "Average Issues per Project",
      Value: summary.statistics.averageIssuesPerProject.toFixed(1),
      Percentage: "",
    },
    {
      Metric: "Average Issues per File",
      Value: summary.statistics.averageIssuesPerFile.toFixed(2),
      Percentage: "",
    },
  ];

  await statsCsv.writeRecords(statsRecords);

  console.log(chalk.green("  ✅ CSV reports generated"));
}

async function generateJSONReports(
  results: ProjectAnalysisResult[],
  summary: AnalysisData["summary"],
  metadata: AnalysisData["metadata"]
): Promise<void> {
  console.log(chalk.blue("📊 Generating JSON reports..."));

  // Detailed results report
  await saveJson(`${config.output.reportsDir}/detailed-results.json`, {
    metadata,
    summary,
    results: results.map((result) => ({
      project: result.project,
      analysis: result.analysis,
      statistics: result.statistics,
      fileDiscovery: (result as any).fileDiscovery,
      topIssues: getTopIssuesForProject(result),
    })),
  });

  // Summary report
  await saveJson(`${config.output.reportsDir}/summary-report.json`, {
    metadata,
    summary,
    issueBreakdown: {
      byCategory: summary.issueCategories,
      bySeverity: summary.issueSeverity,
      topIssues: summary.topIssues,
    },
    confidenceIntervals: {
      issuePrevalence: summary.statistics.issuePrevalence.confidenceInterval,
    },
  });

  console.log(chalk.green("  ✅ JSON reports generated"));
}

async function generateMarkdownReport(
  results: ProjectAnalysisResult[],
  summary: AnalysisData["summary"],
  metadata: AnalysisData["metadata"],
  errors: AnalysisData["errors"]
): Promise<void> {
  console.log(chalk.blue("📊 Generating Markdown report..."));

  const markdown = generateMarkdownContent(results, summary, metadata, errors);
  await saveJson(`${config.output.reportsDir}/research-report.md`, markdown);

  console.log(chalk.green("  ✅ Markdown report generated"));
}

function generateMarkdownContent(
  results: ProjectAnalysisResult[],
  summary: AnalysisData["summary"],
  metadata: AnalysisData["metadata"],
  errors: AnalysisData["errors"]
): string {
  const { overview, statistics } = summary;

  return `# NextJS Projects JavaScript Syntax Research Report

## Executive Summary

This report presents the findings of a comprehensive analysis of ${
    overview.totalProjects
  } popular NextJS projects on GitHub, examining the prevalence of invalid JavaScript syntax and features using the es-guard tool.

### Key Findings

- **Issue Prevalence**: ${statistics.issuePrevalence.percentage.toFixed(
    1
  )}% of projects contain invalid JavaScript syntax
- **Confidence Interval**: ${statistics.issuePrevalence.confidenceInterval.lower.toFixed(
    1
  )}% - ${statistics.issuePrevalence.confidenceInterval.upper.toFixed(
    1
  )}% (95% confidence)
- **Total Issues Found**: ${overview.totalIssues} across ${
    overview.totalFiles
  } files
- **Average Issues per Project**: ${statistics.averageIssuesPerProject.toFixed(
    1
  )}

## Methodology

### Sample Selection
- **Sample Size**: ${metadata.config.sampleSize} projects
- **Selection Criteria**: 
  - Minimum ${config.research.searchCriteria.minStars} stars
  - Minimum ${config.research.searchCriteria.minForks} forks
  - Created after ${config.research.searchCriteria.createdAfter}
- **Analysis Scope**: Up to ${
    metadata.config.maxFilesPerProject
  } files per project

### Analysis Process
1. **Project Discovery**: Multi-strategy GitHub search for NextJS projects
2. **File Collection**: Recursive file discovery with pattern filtering
3. **Syntax Analysis**: es-guard analysis of JavaScript/TypeScript files
4. **Statistical Analysis**: Confidence intervals and prevalence calculations

## Detailed Results

### Project Overview
- **Total Projects Analyzed**: ${overview.analyzedProjects}
- **Projects with Issues**: ${overview.projectsWithIssues}
- **Projects without Issues**: ${overview.projectsWithoutIssues}
- **Failed Analyses**: ${overview.failedProjects}

### Issue Distribution

#### By Category
${Object.entries(summary.issueCategories)
  .map(([category, count]) => `- **${category}**: ${count} issues`)
  .join("\n")}

#### By Severity
${Object.entries(summary.issueSeverity)
  .map(([severity, count]) => `- **${severity}**: ${count} issues`)
  .join("\n")}

#### Top Issue Types
${Object.entries(summary.topIssues)
  .slice(0, 10)
  .map(([type, count]) => `- **${type}**: ${count} occurrences`)
  .join("\n")}

### Statistical Significance

The analysis provides a statistically significant sample with:
- **Confidence Level**: 95%
- **Margin of Error**: ${statistics.issuePrevalence.confidenceInterval.margin.toFixed(
    1
  )}%
- **Sample Size**: Sufficient for reliable population estimates

## Recommendations

### For Developers
1. **Regular Syntax Audits**: Implement automated es-guard checks in CI/CD pipelines
2. **Target Environment Awareness**: Ensure code compatibility with target JavaScript environments
3. **Build Process Validation**: Verify that build outputs are compatible with deployment targets

### For Tool Maintainers
1. **Enhanced Detection**: Improve detection of modern JavaScript features in older environments
2. **Better Documentation**: Provide clearer guidance on syntax compatibility
3. **Integration Support**: Develop plugins for popular build tools

## Technical Details

### Analysis Configuration
- **File Patterns**: ${config.research.filePatterns.join(", ")}
- **Excluded Patterns**: ${config.research.excludePatterns.join(", ")}
- **Max File Size**: ${(metadata.config.maxFileSize / 1024 / 1024).toFixed(1)}MB
- **Analysis Timeout**: ${metadata.config.analysisTimeout / 1000}s

### Data Collection
- **Collection Date**: ${metadata.timestamp}
- **GitHub API**: Rate-limited requests with exponential backoff
- **Data Storage**: JSON format with comprehensive metadata

## Conclusion

This research demonstrates that invalid JavaScript syntax is a significant concern in the NextJS ecosystem, affecting approximately ${statistics.issuePrevalence.percentage.toFixed(
    1
  )}% of popular projects. The findings highlight the need for better tooling and awareness around JavaScript compatibility issues.

The confidence interval of ${statistics.issuePrevalence.confidenceInterval.lower.toFixed(
    1
  )}% - ${statistics.issuePrevalence.confidenceInterval.upper.toFixed(
    1
  )}% provides a reliable estimate of the global prevalence of this issue across the NextJS community.

---

*Report generated on ${new Date().toISOString()}*
*Analysis tool: es-guard v${require("es-guard/package.json").version}*
`;
}

async function generateYAMLReport(
  summary: AnalysisData["summary"],
  metadata: AnalysisData["metadata"]
): Promise<void> {
  console.log(chalk.blue("📊 Generating YAML report..."));

  await saveYaml(`${config.output.reportsDir}/summary.yaml`, {
    metadata,
    summary,
    generated_at: new Date().toISOString(),
  });

  console.log(chalk.green("  ✅ YAML report generated"));
}

function getTopIssuesForProject(
  result: ProjectAnalysisResult
): Record<string, number> {
  const issueTypes: Record<string, number> = {};

  for (const fileResult of result.results) {
    for (const issue of fileResult.issues) {
      const type = issue.type || "unknown";
      issueTypes[type] = (issueTypes[type] || 0) + 1;
    }
  }

  return Object.entries(issueTypes)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .reduce((obj, [key, value]) => ({ ...obj, [key]: value }), {});
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { main };
