#!/usr/bin/env bun

import { GitHubClient } from "./github-client.js";
import { config, validateConfig } from "./config.js";
import { saveJson, ensureDir, formatDuration } from "./utils.js";
import chalk from "chalk";
import ora from "ora";
import type { GitHubRepository } from "./github-client.js";

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
    const projects = await githubClient.searchNextJSProjects(
      config.research.sampleSize
    );
    const endTime = Date.now();

    spinner.succeed(
      `Found ${projects.length} NextJS projects in ${formatDuration(
        endTime - startTime
      )}`
    );

    // Filter and validate projects
    console.log(chalk.blue("\n📊 Project Statistics:"));
    console.log(chalk.gray(`Total projects found: ${projects.length}`));

    const validProjects = projects.filter((project) => {
      return (
        project.stargazers_count >= config.research.searchCriteria.minStars &&
        project.forks_count >= config.research.searchCriteria.minForks
      );
    });

    console.log(
      chalk.gray(`Projects meeting criteria: ${validProjects.length}`)
    );
    console.log(
      chalk.gray(`Min stars: ${config.research.searchCriteria.minStars}`)
    );
    console.log(
      chalk.gray(`Min forks: ${config.research.searchCriteria.minForks}`)
    );

    // Sort by popularity (stars)
    validProjects.sort((a, b) => b.stargazers_count - a.stargazers_count);

    // Take the top projects up to sample size
    const sampledProjects = validProjects.slice(0, config.research.sampleSize);

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
        validProjects: validProjects.length,
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
  const stars = projects.map((p) => p.stargazers_count);
  const forks = projects.map((p) => p.forks_count);
  const dates = projects.map((p) => new Date(p.created_at));

  const languages = [
    ...new Set(projects.map((p) => p.language).filter(Boolean) as string[]),
  ];

  return {
    totalProjects: projects.length,
    avgStars: stars.reduce((a, b) => a + b, 0) / stars.length,
    avgForks: forks.reduce((a, b) => a + b, 0) / forks.length,
    minStars: Math.min(...stars),
    maxStars: Math.max(...stars),
    minForks: Math.min(...forks),
    maxForks: Math.max(...forks),
    oldestDate: new Date(Math.min(...dates)).toISOString().split("T")[0],
    newestDate: new Date(Math.max(...dates)).toISOString().split("T")[0],
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
