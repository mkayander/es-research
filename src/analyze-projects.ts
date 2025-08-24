#!/usr/bin/env bun

import { GitHubClient, type GitHubRepository } from "./github-client.js";
import {
  ESGuardAnalyzer,
  type ProjectAnalysisResult,
} from "./es-guard-analyzer.js";
import { config, validateConfig } from "./config.js";
import {
  loadJson,
  saveJson,
  ensureDir,
  parseRepositoryName,
  calculateConfidenceInterval,
  detectPackageManager,
  isCriticalError,
} from "./utils.js";
import chalk from "chalk";
import cliProgress from "cli-progress";
import { promises as fs, existsSync } from "node:fs";
import { join } from "path";
import { execSync } from "child_process";
import { tmpdir } from "os";

// Custom error classes for better error handling
export class InstallationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InstallationError";
  }
}

export class BuildError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BuildError";
  }
}

export class NotNextJSProjectError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotNextJSProjectError";
  }
}

interface AnalysisError {
  project: string;
  error: string;
  timestamp: string;
  isCritical: boolean;
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
  };
  issueCategories: Record<string, number>;
  issueSeverity: Record<string, number>;
  topIssues: Record<string, number>;
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
        const projectResult = await analyzeProject(githubClient, project);
        results.push(projectResult);

        // Save individual project result
        const projectFile = `${config.output.dataDir}/project-${project.id}.json`;
        await saveJson(projectFile, projectResult);

        // Rate limiting
        await new Promise((resolve) => setTimeout(resolve, 1000));
      } catch (error) {
        const errorMessage = (error as Error).message;
        const isCritical = isCriticalError(error as Error);

        console.error(
          chalk.red(
            `\n❌ Error analyzing ${project.full_name}: ${errorMessage}`
          )
        );

        errors.push({
          project: project.full_name,
          error: errorMessage,
          timestamp: new Date().toISOString(),
          isCritical,
        });

        // Stop processing if this is a critical error
        if (isCritical) {
          console.error(
            chalk.red.bold(
              `\n🚨 Critical error detected. Stopping analysis process.`
            )
          );
          progressBar.stop();
          process.exit(1);
        }
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
 * - Clone repository to temporary directory
 * - Build NextJS project
 * - Analyze with es-guard
 * - Return analysis result
 */
async function analyzeProject(
  _githubClient: GitHubClient,
  project: GitHubRepository
): Promise<ProjectAnalysisResult & {}> {
  const { owner, name } = parseRepositoryName(project.full_name);

  // Create temporary directory for this repository
  const tempDir = join(tmpdir(), `es-research-${owner}-${name}`);
  await fs.rm(tempDir, { recursive: true, force: true });
  await ensureDir(tempDir);

  try {
    // Clone repository
    console.log(chalk.gray(`  📥 Cloning ${project.full_name}...`));
    const cloneUrl = project.clone_url;

    // Use git clone with depth 1 for faster cloning
    execSync(`git clone --depth 1 --single-branch "${cloneUrl}" "${tempDir}"`, {
      stdio: "pipe",
    });

    // Build NextJS project
    console.log(chalk.gray(`  🔨 Building ${project.full_name}...`));
    try {
      await buildNextJSProject(tempDir);
    } catch (buildError) {
      console.warn(
        chalk.yellow(
          `⚠️  Build failed for ${project.full_name}: ${(buildError as Error).message}`
        )
      );
      console.log(
        chalk.gray(`  📝 Continuing with analysis of source files...`)
      );
    }

    // Analyze with es-guard
    const analyzer = new ESGuardAnalyzer();
    const analysisResult = await analyzer.analyzeProject(project, tempDir);

    return {
      ...analysisResult,
    };
  } finally {
    // Clean up temporary directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      console.warn(
        chalk.yellow(
          `Warning: Could not clean up temporary directory ${tempDir}: ${
            (error as Error).message
          }`
        )
      );
    }
  }
}

/**
 * Build a NextJS project in the given directory
 */
async function buildNextJSProject(projectDir: string): Promise<void> {
  const packageJsonPath = join(projectDir, "package.json");

  // Check if package.json exists
  if (!existsSync(packageJsonPath)) {
    throw new Error("No package.json found");
  }

  // Read package.json to check for NextJS dependency
  const packageJson = await fs.readFile(packageJsonPath, "utf-8");
  const packageData = JSON.parse(packageJson);

  const hasNextJS =
    packageData.dependencies?.next ?? packageData.devDependencies?.next;
  if (!hasNextJS) {
    throw new NotNextJSProjectError("Not a NextJS project");
  }

  console.log(chalk.gray(`    🔎 Detecting package manager...`));

  // Detect package manager
  const packageManager = detectPackageManager(projectDir);
  console.log(
    chalk.gray(
      `    📦 Using ${packageManager.manager} to install dependencies...`
    )
  );

  // Install dependencies
  try {
    execSync(packageManager.installCommand, {
      cwd: projectDir,
      stdio: "pipe",
      timeout: 300000, // 5 minutes timeout
    });
  } catch (error) {
    throw new InstallationError(
      `Failed to install dependencies with ${packageManager.manager}: ${(error as Error).message}`
    );
  }

  console.log(chalk.gray(`    🏗️  Building project...`));

  // Try to build the project
  try {
    // Check for build script
    if (packageData.scripts?.build) {
      execSync(packageManager.buildCommand, {
        cwd: projectDir,
        stdio: "pipe",
        timeout: 600000, // 10 minutes timeout for build
      });
    } else {
      throw new BuildError("No build script found in package.json");
    }

    console.log(chalk.gray(`    ✅ Build completed successfully`));
  } catch (error) {
    throw new BuildError(
      `Build failed with ${packageManager.manager}: ${(error as Error).message}`
    );
  }
}

function generateAnalysisSummary(
  results: ProjectAnalysisResult[],
  errors: AnalysisError[]
): AnalysisSummary {
  const totalProjects = results.length + errors.length;
  const projectsWithIssues = results.filter(
    (r) => r.results.errors.length > 0 || r.results.warnings.length > 0
  ).length;
  const totalFiles = results.reduce(
    (sum, r) => sum + r.results.errors.length + r.results.warnings.length,
    0
  );
  const totalIssues = results.reduce(
    (sum, r) => sum + r.results.errors.length + r.results.warnings.length,
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
      const prefix = error.isCritical ? "🚨 CRITICAL: " : "  ";
      const color = error.isCritical ? chalk.red.bold : chalk.red;

      // Add package manager info for installation/build errors
      let displayError = error.error;
      if (
        error.error.includes("Failed to install dependencies") ||
        error.error.includes("Build failed")
      ) {
        const packageManagerMatch = error.error.match(/with (\w+):/);
        if (packageManagerMatch) {
          displayError = `${error.error} (Package Manager: ${packageManagerMatch[1]})`;
        }
      }

      console.log(color(`${prefix}${error.project}: ${displayError}`));
    });
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { main };
