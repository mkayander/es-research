import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface GitHubConfig {
  token: string | undefined;
  baseUrl: string;
  userAgent: string;
}

export interface SearchCriteria {
  framework: string;
  minStars: number;
  minForks: number;
  createdAfter: string;
}

export interface ResearchConfig {
  sampleSize: number;
  confidenceLevel: number;
  marginOfError: number;
  searchCriteria: SearchCriteria;
  filePatterns: string[];
  excludePatterns: string[];
}

export interface OutputConfig {
  dataDir: string;
  reportsDir: string;
  cacheDir: string;
}

export interface AnalysisConfig {
  analysisTimeout: number;
  concurrency: number;
  maxProjectsToAnalyze: number;
}

export interface Config {
  github: GitHubConfig;
  research: ResearchConfig;
  output: OutputConfig;
  analysis: AnalysisConfig;
}

export const config: Config = {
  // GitHub API Configuration
  github: {
    token: process.env.GITHUB_TOKEN,
    baseUrl: "https://api.github.com",
    userAgent: "es-research/1.0.0",
  },

  // Research Parameters
  research: {
    // Sample size for the research (following statistical best practices)
    sampleSize: 1000,
    // Confidence level for statistical analysis
    confidenceLevel: 0.95,
    // Margin of error
    marginOfError: 0.05,

    // GitHub search criteria
    searchCriteria: {
      framework: "nextjs",
      minStars: 0, // Minimum stars to consider "popular"
      minForks: 0, // Minimum forks as engagement indicator
      createdAfter: "2010-01-01", // Focus on modern projects
    },

    // File patterns to include in analysis
    filePatterns: ["**/*.js", "**/*.jsx", "**/*.mjs", "**/*.ts", "**/*.tsx"],
    // File patterns to exclude from analysis
    excludePatterns: [
      "**/node_modules/**",
      "**/dist/**",
      "**/build/**",
      "**/.next/**",
    ],
  },

  // Output Configuration
  output: {
    dataDir: join(__dirname, "..", "data"),
    reportsDir: join(__dirname, "..", "reports"),
    cacheDir: join(__dirname, "..", "cache"),
  },

  // Analysis Configuration
  analysis: {
    // Timeout for es-guard analysis (in milliseconds)
    analysisTimeout: 30000,
    // Concurrent analysis jobs
    concurrency: 5,
    // Maximum number of projects to analyze (0 = analyze all)
    maxProjectsToAnalyze: 1,
  },
};

// Validate required configuration
export function validateConfig(): boolean {
  // GitHub token validation
  if (!config.github.token) {
    throw new Error("GITHUB_TOKEN environment variable is required");
  }

  // Sample size validation
  if (config.research.sampleSize < 100) {
    throw new Error(
      "Sample size should be at least 100 for meaningful results"
    );
  }

  // Confidence level validation
  if (
    config.research.confidenceLevel <= 0 ||
    config.research.confidenceLevel >= 1
  ) {
    throw new Error("Confidence level must be between 0 and 1");
  }

  // Margin of error validation
  if (
    config.research.marginOfError <= 0 ||
    config.research.marginOfError >= 1
  ) {
    throw new Error("Margin of error must be between 0 and 1");
  }

  // Search criteria validation
  const criteria = config.research.searchCriteria;
  if (criteria.minStars < 0) {
    throw new Error("Minimum stars must be greater than or equal to 0");
  }
  if (criteria.minForks < 0) {
    throw new Error("Minimum forks must be greater than or equal to 0");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(criteria.createdAfter)) {
    throw new Error("Created after date must be in YYYY-MM-DD format");
  }

  // Analysis configuration validation
  if (config.analysis.analysisTimeout <= 0) {
    throw new Error("Analysis timeout must be greater than 0");
  }
  if (config.analysis.concurrency <= 0) {
    throw new Error("Concurrency must be greater than 0");
  }

  return true;
}
