#!/usr/bin/env bun

import {
  GitHubClient,
  type GitHubRepository,
  type GitHubContent,
} from "./github-client.js";
import {
  ESGuardAnalyzer,
  type FileToAnalyze,
  type ProjectAnalysisResult,
} from "./es-guard-analyzer.js";
import { config, validateConfig } from "./config.js";
import {
  loadJson,
  saveJson,
  ensureDir,
  filterFiles,
  parseRepositoryName,
  calculateConfidenceInterval,
} from "./utils.js";
import chalk from "chalk";
import cliProgress from "cli-progress";

interface AnalysisError {
  project: string;
  error: string;
  timestamp: string;
}

interface AnalysisSummary {
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
}

interface FileInfo {
  path: string;
  size?: number;
  type?: string;
}

interface ProjectsData {
  metadata: {
    totalFound: number;
    validProjects: number;
    sampledProjects: number;
    sampleSize: number;
    searchCriteria: {
      language: string;
      framework: string;
      minStars: number;
      minForks: number;
      createdAfter: string;
    };
    timestamp: string;
    duration: number;
  };
  projects: GitHubRepository[];
}

async function main(): Promise<void> {
  console.log(chalk.blue.bold("🔍 NextJS Projects Research - Analysis"));
  console.log(chalk.gray("Analyzing JavaScript files with es-guard...\n"));

  try {
    // Validate configuration
    validateConfig();

    // Load projects from previous fetch
    const projectsFile = `${config.output.dataDir}/projects.json`;
    const projectsData = await loadJson<ProjectsData>(projectsFile);

    if (!projectsData) {
      throw new Error(
        'No projects data found. Please run "bun run fetch" first.'
      );
    }

    const { projects } = projectsData;

    // Apply project limit if configured
    let projectsToAnalyze = projects;
    if (config.analysis.maxProjectsToAnalyze > 0) {
      projectsToAnalyze = projects.slice(
        0,
        config.analysis.maxProjectsToAnalyze
      );
      console.log(
        chalk.blue(
          `📊 Analyzing ${projectsToAnalyze.length} projects (limited from ${projects.length} total)`
        )
      );
    } else {
      console.log(chalk.blue(`📊 Analyzing ${projects.length} projects`));
    }

    // Check es-guard availability
    const analyzer = new ESGuardAnalyzer();
    const esGuardAvailable = analyzer.checkESGuardAvailability();

    if (!esGuardAvailable) {
      throw new Error("es-guard is not available. Please install it first.");
    }

    console.log(chalk.green("✅ es-guard is available"));

    // Create output directories
    await ensureDir(config.output.dataDir);
    await ensureDir(config.output.reportsDir);

    const githubClient = new GitHubClient();
    const results: ProjectAnalysisResult[] = [];
    const errors: AnalysisError[] = [];

    // Progress bar for projects
    const progressBar = new cliProgress.SingleBar({
      format:
        "Progress |{bar}| {percentage}% | {value}/{total} projects | ETA: {eta}s | {project}",
      barCompleteChar: "\u2588",
      barIncompleteChar: "\u2591",
      hideCursor: true,
    });

    progressBar.start(projectsToAnalyze.length, 0, { project: "Starting..." });

    for (let i = 0; i < projectsToAnalyze.length; i++) {
      const project = projectsToAnalyze[i];
      if (!project) continue;

      progressBar.update(i, { project: project.full_name });

      try {
        // Analyze project
        const projectResult = await analyzeProject(
          githubClient,
          analyzer,
          project
        );
        results.push(projectResult);

        // Save individual project result
        const projectFile = `${config.output.dataDir}/project-${project.id}.json`;
        await saveJson(projectFile, projectResult);

        // Rate limiting
        await new Promise((resolve) => setTimeout(resolve, 1000));
      } catch (error) {
        console.error(
          chalk.red(
            `\n❌ Error analyzing ${project.full_name}: ${
              (error as Error).message
            }`
          )
        );
        errors.push({
          project: project.full_name,
          error: (error as Error).message,
          timestamp: new Date().toISOString(),
        });
      }
    }

    progressBar.stop();

    // Generate analysis summary
    const summary = generateAnalysisSummary(results, errors);

    // Save analysis results
    const analysisFile = `${config.output.dataDir}/analysis-results.json`;
    await saveJson(analysisFile, {
      metadata: {
        totalProjects: projects.length,
        analyzedProjects: results.length,
        failedProjects: errors.length,
        projectsAnalyzed: projectsToAnalyze.length,
        maxProjectsToAnalyze: config.analysis.maxProjectsToAnalyze,
        timestamp: new Date().toISOString(),
        config: {
          sampleSize: config.research.sampleSize,
          maxFilesPerProject: config.analysis.maxFilesPerProject,
          maxFileSize: config.analysis.maxFileSize,
          maxProjectsToAnalyze: config.analysis.maxProjectsToAnalyze,
        },
      },
      summary,
      results,
      errors,
    });

    // Display results
    displayResults(summary, results, errors);

    console.log(chalk.green.bold("\n✅ Analysis completed successfully!"));
    console.log(
      chalk.gray('Next step: Run "bun run report" to generate detailed reports')
    );
  } catch (error) {
    console.error(chalk.red.bold("\n❌ Error during analysis:"));
    console.error(chalk.red((error as Error).message));
    process.exit(1);
  }
}

/**
 * Main logic:
 * - Get repository contents
 * - Recursively get all files
 * - Filter files for analysis
 * - Limit files per project
 * - Get file contents
 * - Analyze with es-guard
 * - Return analysis result
 */
async function analyzeProject(
  githubClient: GitHubClient,
  analyzer: ESGuardAnalyzer,
  project: GitHubRepository
): Promise<
  ProjectAnalysisResult & {
    fileDiscovery: {
      totalFiles: number;
      filteredFiles: number;
      analyzedFiles: number;
      skippedFiles: number;
    };
  }
> {
  const { owner, name } = parseRepositoryName(project.full_name);

  // Get repository contents
  const contents = await githubClient.getRepositoryContents(owner, name);
  if (!contents) {
    throw new Error("Repository not accessible");
  }

  // Recursively get all files
  const files = await getAllFiles(githubClient, owner, name, contents);

  // Filter files for analysis
  const filteredFiles = filterFiles(
    files,
    config.research.filePatterns,
    config.research.excludePatterns,
    config.analysis.maxFileSize
  );

  // Limit files per project
  const filesToAnalyze = filteredFiles.slice(
    0,
    config.analysis.maxFilesPerProject
  );

  // Get file contents
  const filesWithContent: FileToAnalyze[] = [];
  for (const file of filesToAnalyze) {
    try {
      const content = await githubClient.getFileContent(owner, name, file.path);
      if (content) {
        filesWithContent.push({
          path: file.path,
          content,
        });
      }
    } catch (error) {
      // Skip files that can't be read
      console.warn(
        chalk.yellow(
          `Warning: Could not read ${file.path}: ${(error as Error).message}`
        )
      );
    }
  }

  // Analyze with es-guard
  const analysisResult = await analyzer.analyzeProject(
    project,
    filesWithContent
  );

  return {
    ...analysisResult,
    fileDiscovery: {
      totalFiles: files.length,
      filteredFiles: filteredFiles.length,
      analyzedFiles: filesWithContent.length,
      skippedFiles: files.length - filteredFiles.length,
    },
  };
}

async function getAllFiles(
  githubClient: GitHubClient,
  owner: string,
  repo: string,
  contents: GitHubContent[],
  path = ""
): Promise<FileInfo[]> {
  const files: FileInfo[] = [];

  for (const item of contents) {
    const itemPath = path ? `${path}/${item.name}` : item.name;

    if (item.type === "file") {
      const fileInfo: FileInfo = {
        path: itemPath,
        type: item.type,
      };
      if (item.size !== undefined) {
        fileInfo.size = item.size;
      }
      files.push(fileInfo);
    } else if (item.type === "dir") {
      try {
        const subContents = await githubClient.getRepositoryContents(
          owner,
          repo,
          itemPath
        );
        if (subContents) {
          const subFiles = await getAllFiles(
            githubClient,
            owner,
            repo,
            subContents,
            itemPath
          );
          files.push(...subFiles);
        }
      } catch (error) {
        // Skip directories that can't be accessed
        console.warn(
          chalk.yellow(
            `Warning: Could not access directory ${itemPath}: ${
              (error as Error).message
            }`
          )
        );
      }
    }
  }

  return files;
}

function generateAnalysisSummary(
  results: ProjectAnalysisResult[],
  errors: AnalysisError[]
): AnalysisSummary {
  const totalProjects = results.length + errors.length;
  const projectsWithIssues = results.filter(
    (r) => r.statistics.filesWithIssues > 0
  ).length;
  const totalFiles = results.reduce((sum, r) => sum + r.analysis.totalFiles, 0);
  const totalIssues = results.reduce(
    (sum, r) => sum + r.statistics.totalIssues,
    0
  );

  // Calculate confidence interval
  const confidenceInterval = calculateConfidenceInterval(
    projectsWithIssues,
    totalProjects
  );

  return {
    overview: {
      totalProjects,
      analyzedProjects: results.length,
      failedProjects: errors.length,
      projectsWithIssues,
      projectsWithoutIssues: results.length - projectsWithIssues,
      totalFiles,
      totalIssues,
    },
    statistics: {
      issuePrevalence: {
        percentage: (projectsWithIssues / totalProjects) * 100,
        confidenceInterval: {
          lower: confidenceInterval.lower * 100,
          upper: confidenceInterval.upper * 100,
          margin: confidenceInterval.margin * 100,
        },
      },
      averageIssuesPerProject: totalIssues / results.length,
      averageIssuesPerFile: totalIssues / totalFiles,
      averageFilesPerProject: totalFiles / results.length,
    },
    issueCategories: aggregateIssueCategories(results),
    issueSeverity: aggregateIssueSeverity(results),
    topIssues: getTopIssues(results),
  };
}

function aggregateIssueCategories(
  results: ProjectAnalysisResult[]
): Record<string, number> {
  const categories: Record<string, number> = {};

  for (const result of results) {
    for (const [category, count] of Object.entries(
      result.statistics.categories
    )) {
      categories[category] = (categories[category] ?? 0) + count;
    }
  }

  return Object.entries(categories)
    .sort(([, a], [, b]) => b - a)
    .reduce((obj, [key, value]) => ({ ...obj, [key]: value }), {});
}

function aggregateIssueSeverity(
  results: ProjectAnalysisResult[]
): Record<string, number> {
  const severity: Record<string, number> = { error: 0, warning: 0, info: 0 };

  for (const result of results) {
    for (const [level, count] of Object.entries(result.statistics.severity)) {
      severity[level] = (severity[level] ?? 0) + count;
    }
  }

  return severity;
}

function getTopIssues(
  results: ProjectAnalysisResult[]
): Record<string, number> {
  const issueTypes: Record<string, number> = {};

  for (const result of results) {
    for (const [type, count] of Object.entries(result.statistics.issueTypes)) {
      issueTypes[type] = (issueTypes[type] ?? 0) + count;
    }
  }

  return Object.entries(issueTypes)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .reduce((obj, [key, value]) => ({ ...obj, [key]: value }), {});
}

function displayResults(
  summary: AnalysisSummary,
  _results: ProjectAnalysisResult[],
  errors: AnalysisError[]
): void {
  console.log(chalk.blue.bold("\n📊 Analysis Results:"));

  const { overview, statistics } = summary;

  console.log(chalk.white(`\n📈 Overview:`));
  console.log(
    chalk.gray(`  Total projects analyzed: ${overview.analyzedProjects}`)
  );
  console.log(
    chalk.gray(`  Projects with issues: ${overview.projectsWithIssues}`)
  );
  console.log(
    chalk.gray(`  Projects without issues: ${overview.projectsWithoutIssues}`)
  );
  console.log(chalk.gray(`  Failed analyses: ${overview.failedProjects}`));
  console.log(chalk.gray(`  Total files analyzed: ${overview.totalFiles}`));
  console.log(chalk.gray(`  Total issues found: ${overview.totalIssues}`));

  console.log(chalk.white(`\n📊 Statistics:`));
  console.log(
    chalk.gray(
      `  Issue prevalence: ${statistics.issuePrevalence.percentage.toFixed(1)}%`
    )
  );
  console.log(
    chalk.gray(
      `  Confidence interval: ${statistics.issuePrevalence.confidenceInterval.lower.toFixed(
        1
      )}% - ${statistics.issuePrevalence.confidenceInterval.upper.toFixed(1)}%`
    )
  );
  console.log(
    chalk.gray(
      `  Average issues per project: ${statistics.averageIssuesPerProject.toFixed(
        1
      )}`
    )
  );
  console.log(
    chalk.gray(
      `  Average issues per file: ${statistics.averageIssuesPerFile.toFixed(2)}`
    )
  );

  console.log(chalk.white(`\n🚨 Issue Categories:`));
  for (const [category, count] of Object.entries(summary.issueCategories)) {
    console.log(chalk.gray(`  ${category}: ${count}`));
  }

  console.log(chalk.white(`\n⚠️  Issue Severity:`));
  for (const [severity, count] of Object.entries(summary.issueSeverity)) {
    const color =
      severity === "error"
        ? chalk.red
        : severity === "warning"
        ? chalk.yellow
        : chalk.blue;
    console.log(color(`  ${severity}: ${count}`));
  }

  if (errors.length > 0) {
    console.log(chalk.red(`\n❌ Failed Analyses:`));
    errors.forEach((error) => {
      console.log(chalk.red(`  ${error.project}: ${error.error}`));
    });
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { main };
