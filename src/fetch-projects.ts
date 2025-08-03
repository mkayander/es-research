#!/usr/bin/env bun

import { GitHubClient, type GitHubRepository } from "./github-client.js";
import { config, validateConfig } from "./config.js";
import { saveJson, ensureDir, formatDuration } from "./utils.js";
import chalk from "chalk";
import ora from "ora";

interface ProjectStats {
  totalProjects: number;
  avgStars: number;
  avgForks: number;
  minStars: number;
  maxStars: number;
  minForks: number;
  maxForks: number;
  oldestDate: string;
  newestDate: string;
  languages: string[];
  starDistribution: Record<string, number>;
  forkDistribution: Record<string, number>;
}

interface ProjectsData {
  metadata: {
    totalFound: number;
    validProjects: number;
    sampledProjects: number;
    sampleSize: number;
    searchCriteria: {
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
  console.log(chalk.blue.bold("🔍 NextJS Projects Research - Data Collection"));
  console.log(chalk.gray("Fetching popular NextJS projects from GitHub...\n"));

  try {
    // Validate configuration
    validateConfig();

    // Create output directories
    await ensureDir(config.output.dataDir);
    await ensureDir(config.output.cacheDir);

    const githubClient = new GitHubClient();

    // Check rate limits
    const rateLimitInfo = githubClient.getRateLimitInfo();
    if (rateLimitInfo) {
      console.log(
        chalk.yellow(
          `Rate limit: ${rateLimitInfo.resources.core.remaining}/${rateLimitInfo.resources.core.limit} requests remaining`
        )
      );
    }

    // Fetch projects with progress indicator
    const spinner = ora("Searching for NextJS projects...").start();

    const startTime = Date.now();
    let projects: GitHubRepository[] = [];

    try {
      projects = await githubClient.searchNextJSProjects(
        config.research.sampleSize
      );
    } catch (error) {
      spinner.fail("Failed to search for projects");
      throw error;
    }

    const endTime = Date.now();

    spinner.succeed(
      `Found ${projects.length} NextJS projects in ${formatDuration(
        endTime - startTime
      )}`
    );

    // Projects are already filtered by search criteria, just sort and sample
    console.log(chalk.blue("\n📊 Project Statistics:"));
    console.log(chalk.gray(`Total projects found: ${projects.length}`));

    // Sort by popularity (stars)
    projects.sort((a, b) => b.stargazers_count - a.stargazers_count);

    // Take the top projects up to sample size
    const sampledProjects = projects.slice(0, config.research.sampleSize);

    console.log(
      chalk.green(
        `\n✅ Selected ${sampledProjects.length} projects for analysis`
      )
    );

    // Save project list
    const projectsFile = `${config.output.dataDir}/projects.json`;
    const projectsData: ProjectsData = {
      metadata: {
        totalFound: projects.length,
        validProjects: projects.length,
        sampledProjects: sampledProjects.length,
        sampleSize: config.research.sampleSize,
        searchCriteria: config.research.searchCriteria,
        timestamp: new Date().toISOString(),
        duration: endTime - startTime,
      },
      projects: sampledProjects,
    };

    await saveJson(projectsFile, projectsData);

    console.log(chalk.green(`📁 Project list saved to: ${projectsFile}`));

    // Generate summary statistics
    const stats = generateProjectStats(sampledProjects);
    console.log(chalk.blue("\n📈 Sample Statistics:"));
    console.log(chalk.gray(`Average stars: ${stats.avgStars.toFixed(0)}`));
    console.log(chalk.gray(`Average forks: ${stats.avgForks.toFixed(0)}`));
    console.log(
      chalk.gray(`Date range: ${stats.oldestDate} to ${stats.newestDate}`)
    );
    console.log(chalk.gray(`Languages: ${stats.languages.join(", ")}`));

    // Save statistics
    const statsFile = `${config.output.dataDir}/project-stats.json`;
    await saveJson(statsFile, stats);
    console.log(chalk.green(`📊 Statistics saved to: ${statsFile}`));

    // Show top projects
    console.log(chalk.blue("\n🏆 Top 10 Projects by Stars:"));
    sampledProjects.slice(0, 10).forEach((project, index) => {
      console.log(chalk.white(`${index + 1}. ${project.full_name}`));
      console.log(
        chalk.gray(
          `   ⭐ ${project.stargazers_count} stars | 🍴 ${project.forks_count} forks`
        )
      );
      if (project.description) {
        console.log(chalk.gray(`   ${project.description}`));
      }
      console.log("");
    });

    console.log(
      chalk.green.bold("\n✅ Project fetching completed successfully!")
    );
    console.log(
      chalk.gray('Next step: Run "bun run analyze" to analyze the projects')
    );
  } catch (error) {
    console.error(chalk.red.bold("\n❌ Error fetching projects:"));
    console.error(chalk.red((error as Error).message));

    if ((error as { status?: number }).status === 403) {
      console.error(
        chalk.yellow(
          "\n💡 This might be a rate limit issue. Please check your GitHub token."
        )
      );
    }

    process.exit(1);
  }
}

function generateProjectStats(projects: GitHubRepository[]): ProjectStats {
  if (projects.length === 0) {
    return {
      totalProjects: 0,
      avgStars: 0,
      avgForks: 0,
      minStars: 0,
      maxStars: 0,
      minForks: 0,
      maxForks: 0,
      oldestDate: "",
      newestDate: "",
      languages: [],
      starDistribution: {
        "0-100": 0,
        "101-500": 0,
        "501-1000": 0,
        "1001-5000": 0,
        "5000+": 0,
      },
      forkDistribution: {
        "0-10": 0,
        "11-50": 0,
        "51-100": 0,
        "101-500": 0,
        "500+": 0,
      },
    };
  }

  const stars = projects.map((p) => p.stargazers_count);
  const forks = projects.map((p) => p.forks_count);

  // Safely parse dates, filtering out invalid ones
  const validDates = projects
    .map((p) => p.created_at)
    .filter((dateStr) => dateStr && dateStr.trim() !== "")
    .map((dateStr) => new Date(dateStr))
    .filter((date) => !isNaN(date.getTime()));

  const languages = [
    ...new Set(projects.map((p) => p.language).filter(Boolean) as string[]),
  ];

  const oldestDate =
    validDates.length > 0
      ? new Date(Math.min(...validDates.map((d) => d.getTime())))
          .toISOString()
          .split("T")[0] ?? ""
      : "";
  const newestDate =
    validDates.length > 0
      ? new Date(Math.max(...validDates.map((d) => d.getTime())))
          .toISOString()
          .split("T")[0] ?? ""
      : "";

  return {
    totalProjects: projects.length,
    avgStars: stars.reduce((a, b) => a + b, 0) / stars.length,
    avgForks: forks.reduce((a, b) => a + b, 0) / forks.length,
    minStars: Math.min(...stars),
    maxStars: Math.max(...stars),
    minForks: Math.min(...forks),
    maxForks: Math.max(...forks),
    oldestDate,
    newestDate,
    languages,
    starDistribution: {
      "0-100": stars.filter((s) => s <= 100).length,
      "101-500": stars.filter((s) => s > 100 && s <= 500).length,
      "501-1000": stars.filter((s) => s > 500 && s <= 1000).length,
      "1001-5000": stars.filter((s) => s > 1000 && s <= 5000).length,
      "5000+": stars.filter((s) => s > 5000).length,
    },
    forkDistribution: {
      "0-10": forks.filter((f) => f <= 10).length,
      "11-50": forks.filter((f) => f > 10 && f <= 50).length,
      "51-100": forks.filter((f) => f > 50 && f <= 100).length,
      "101-500": forks.filter((f) => f > 100 && f <= 500).length,
      "500+": forks.filter((f) => f > 500).length,
    },
  };
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { main };
