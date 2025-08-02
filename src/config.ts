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
  language: string;
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
  maxFilesPerProject: number;
  maxFileSize: number;
  analysisTimeout: number;
  concurrency: number;
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
      language: "javascript",
      framework: "nextjs",
      minStars: 100, // Minimum stars to consider "popular"
      minForks: 10, // Minimum forks as engagement indicator
      createdAfter: "2020-01-01", // Focus on modern projects
    },

    // File patterns to analyze
    filePatterns: [
      "**/*.js",
      "**/*.jsx",
      "**/*.ts",
      "**/*.tsx",
      "**/next.config.js",
      "**/next.config.mjs",
    ],

    // Directories to exclude
    excludePatterns: [
      "**/node_modules/**",
      "**/.next/**",
      "**/dist/**",
      "**/build/**",
      "**/.git/**",
      "**/coverage/**",
      "**/.nyc_output/**",
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
    // Maximum files to analyze per project (to avoid overwhelming)
    maxFilesPerProject: 100,
    // Maximum file size to analyze (in bytes)
    maxFileSize: 1024 * 1024, // 1MB
    // Timeout for es-guard analysis (in milliseconds)
    analysisTimeout: 30000,
    // Concurrent analysis jobs
    concurrency: 5,
  },
};

// Validate required configuration
export function validateConfig(): boolean {
  if (!config.github.token) {
    throw new Error("GITHUB_TOKEN environment variable is required");
  }

  if (config.research.sampleSize < 100) {
    throw new Error(
      "Sample size should be at least 100 for meaningful results"
    );
  }

  return true;
}
