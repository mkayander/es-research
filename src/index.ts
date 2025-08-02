#!/usr/bin/env bun

import { Command } from "commander";
import { config, validateConfig } from "./config.js";
import { ensureDir } from "./utils.js";
import chalk from "chalk";

const program = new Command();

program
  .name("es-research")
  .description("Research tool for analyzing NextJS projects with es-guard")
  .version("1.0.0");

program
  .command("fetch")
  .description("Fetch popular NextJS projects from GitHub")
  .option(
    "-s, --sample-size <number>",
    "Number of projects to fetch",
    config.research.sampleSize.toString()
  )
  .option(
    "--min-stars <number>",
    "Minimum stars for projects",
    config.research.searchCriteria.minStars.toString()
  )
  .option(
    "--min-forks <number>",
    "Minimum forks for projects",
    config.research.searchCriteria.minForks.toString()
  )
  .action(
    async (options: {
      sampleSize?: string;
      minStars?: string;
      minForks?: string;
    }) => {
      try {
        // Update config with command line options
        if (options.sampleSize)
          config.research.sampleSize = parseInt(options.sampleSize);
        if (options.minStars)
          config.research.searchCriteria.minStars = parseInt(options.minStars);
        if (options.minForks)
          config.research.searchCriteria.minForks = parseInt(options.minForks);

        validateConfig();
        await ensureDir(config.output.dataDir);

        const { main: fetchMain } = await import("./fetch-projects.js");
        await fetchMain();
      } catch (error) {
        console.error(chalk.red("Error:", (error as Error).message));
        process.exit(1);
      }
    }
  );

program
  .command("analyze")
  .description("Analyze fetched projects with es-guard")
  .option(
    "--max-files <number>",
    "Maximum files per project",
    config.analysis.maxFilesPerProject.toString()
  )
  .option(
    "--max-size <number>",
    "Maximum file size in MB",
    (config.analysis.maxFileSize / 1024 / 1024).toString()
  )
  .option(
    "--concurrency <number>",
    "Number of concurrent analyses",
    config.analysis.concurrency.toString()
  )
  .action(
    async (options: {
      maxFiles?: string;
      maxSize?: string;
      concurrency?: string;
    }) => {
      try {
        // Update config with command line options
        if (options.maxFiles)
          config.analysis.maxFilesPerProject = parseInt(options.maxFiles);
        if (options.maxSize)
          config.analysis.maxFileSize = parseInt(options.maxSize) * 1024 * 1024;
        if (options.concurrency)
          config.analysis.concurrency = parseInt(options.concurrency);

        validateConfig();
        await ensureDir(config.output.dataDir);

        const { main: analyzeMain } = await import("./analyze-projects.js");
        await analyzeMain();
      } catch (error) {
        console.error(chalk.red("Error:", (error as Error).message));
        process.exit(1);
      }
    }
  );

program
  .command("report")
  .description("Generate comprehensive reports from analysis results")
  .action(async () => {
    try {
      validateConfig();
      await ensureDir(config.output.reportsDir);

      const { main: reportMain } = await import("./generate-report.js");
      await reportMain();
    } catch (error) {
      console.error(chalk.red("Error:", (error as Error).message));
      process.exit(1);
    }
  });

program
  .command("research")
  .description("Run complete research pipeline (fetch -> analyze -> report)")
  .option(
    "-s, --sample-size <number>",
    "Number of projects to fetch",
    config.research.sampleSize.toString()
  )
  .option(
    "--min-stars <number>",
    "Minimum stars for projects",
    config.research.searchCriteria.minStars.toString()
  )
  .option(
    "--min-forks <number>",
    "Minimum forks for projects",
    config.research.searchCriteria.minForks.toString()
  )
  .option(
    "--max-files <number>",
    "Maximum files per project",
    config.analysis.maxFilesPerProject.toString()
  )
  .option(
    "--max-size <number>",
    "Maximum file size in MB",
    (config.analysis.maxFileSize / 1024 / 1024).toString()
  )
  .option(
    "--concurrency <number>",
    "Number of concurrent analyses",
    config.analysis.concurrency.toString()
  )
  .action(
    async (options: {
      sampleSize?: string;
      minStars?: string;
      minForks?: string;
      maxFiles?: string;
      maxSize?: string;
      concurrency?: string;
    }) => {
      try {
        console.log(
          chalk.blue.bold("🔬 NextJS Projects Research - Complete Pipeline")
        );
        console.log(chalk.gray("Running full research pipeline...\n"));

        // Update config with command line options
        if (options.sampleSize)
          config.research.sampleSize = parseInt(options.sampleSize);
        if (options.minStars)
          config.research.searchCriteria.minStars = parseInt(options.minStars);
        if (options.minForks)
          config.research.searchCriteria.minForks = parseInt(options.minForks);
        if (options.maxFiles)
          config.analysis.maxFilesPerProject = parseInt(options.maxFiles);
        if (options.maxSize)
          config.analysis.maxFileSize = parseInt(options.maxSize) * 1024 * 1024;
        if (options.concurrency)
          config.analysis.concurrency = parseInt(options.concurrency);

        validateConfig();

        // Create all necessary directories
        await ensureDir(config.output.dataDir);
        await ensureDir(config.output.reportsDir);
        await ensureDir(config.output.cacheDir);

        // Step 1: Fetch projects
        console.log(chalk.blue("📥 Step 1: Fetching projects..."));
        const { main: fetchMain } = await import("./fetch-projects.js");
        await fetchMain();

        // Step 2: Analyze projects
        console.log(chalk.blue("\n🔍 Step 2: Analyzing projects..."));
        const { main: analyzeMain } = await import("./analyze-projects.js");
        await analyzeMain();

        // Step 3: Generate reports
        console.log(chalk.blue("\n📊 Step 3: Generating reports..."));
        const { main: reportMain } = await import("./generate-report.js");
        await reportMain();

        console.log(
          chalk.green.bold("\n🎉 Research pipeline completed successfully!")
        );
        console.log(
          chalk.gray("Check the reports directory for detailed results.")
        );
      } catch (error) {
        console.error(chalk.red("Error:", (error as Error).message));
        process.exit(1);
      }
    }
  );

program
  .command("config")
  .description("Show current configuration")
  .action(() => {
    console.log(chalk.blue.bold("📋 Current Configuration:"));
    console.log(chalk.gray(JSON.stringify(config, null, 2)));
  });

program
  .command("validate")
  .description("Validate configuration and dependencies")
  .action(async () => {
    try {
      console.log(chalk.blue.bold("🔍 Validating Configuration..."));

      // Validate config
      validateConfig();
      console.log(chalk.green("✅ Configuration is valid"));

      // Check es-guard availability
      const { ESGuardAnalyzer } = await import("./es-guard-analyzer.js");
      const analyzer = new ESGuardAnalyzer();
      const esGuardAvailable = await analyzer.checkESGuardAvailability();

      if (esGuardAvailable) {
        console.log(chalk.green("✅ es-guard is available"));
      } else {
        console.log(chalk.red("❌ es-guard is not available"));
      }

      // Check directories
      await ensureDir(config.output.dataDir);
      await ensureDir(config.output.reportsDir);
      await ensureDir(config.output.cacheDir);
      console.log(chalk.green("✅ Output directories are ready"));

      console.log(chalk.green.bold("\n✅ All validations passed!"));
    } catch (error) {
      console.error(
        chalk.red("❌ Validation failed:", (error as Error).message)
      );
      process.exit(1);
    }
  });

// Add help information
program.addHelpText(
  "after",
  `

Examples:
  $ es-research fetch                    # Fetch 1000 projects (default)
  $ es-research fetch -s 500            # Fetch 500 projects
  $ es-research analyze                  # Analyze fetched projects
  $ es-research report                   # Generate reports
  $ es-research research                 # Run complete pipeline
  $ es-research research -s 200         # Run with 200 projects
  $ es-research config                   # Show configuration
  $ es-research validate                 # Validate setup

Environment Variables:
  GITHUB_TOKEN                          # GitHub API token (required)

Output Directories:
  data/                                 # Raw data and analysis results
  reports/                              # Generated reports (CSV, JSON, Markdown)
  cache/                                # Temporary cache files
`
);

program.parse();
