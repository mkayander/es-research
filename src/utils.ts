import { promises as fs } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { createObjectCsvWriter } from "csv-writer";
import yaml from "js-yaml";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface ConfidenceInterval {
  lower: number;
  upper: number;
  margin: number;
}

export interface PackageJsonInfo {
  hasNextJS: boolean;
  nextVersion?: string;
  reactVersion?: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  error?: string;
}

export interface RepositoryInfo {
  owner: string;
  name: string;
}

export interface FileInfo {
  path: string;
  size?: number;
}

/**
 * Sleep for a specified number of milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry a function with exponential backoff
 */
export async function retry<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  baseDelay = 1000
): Promise<T> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === maxRetries) {
        throw error;
      }

      const delay = baseDelay * Math.pow(2, attempt - 1);
      console.warn(
        `Attempt ${attempt} failed, retrying in ${delay}ms: ${
          (error as Error).message
        }`
      );
      await sleep(delay);
    }
  }
  throw new Error("Retry failed");
}

/**
 * Ensure directory exists
 */
export async function ensureDir(path: string): Promise<void> {
  try {
    await fs.access(path);
  } catch {
    await fs.mkdir(path, { recursive: true });
  }
}

/**
 * Save data to JSON file
 */
export async function saveJson(filePath: string, data: unknown): Promise<void> {
  await ensureDir(dirname(filePath));
  await fs.writeFile(filePath, JSON.stringify(data, null, 2));
}

/**
 * Load data from JSON file
 */
export async function loadJson<T>(filePath: string): Promise<T | null> {
  try {
    const content = await fs.readFile(filePath, "utf-8");
    return JSON.parse(content) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

/**
 * Save data to YAML file
 */
export async function saveYaml(filePath: string, data: unknown): Promise<void> {
  await ensureDir(dirname(filePath));
  const yamlContent = yaml.dump(data, { indent: 2 });
  await fs.writeFile(filePath, yamlContent);
}

/**
 * Load data from YAML file
 */
export async function loadYaml<T>(filePath: string): Promise<T | null> {
  try {
    const content = await fs.readFile(filePath, "utf-8");
    return yaml.load(content) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

/**
 * Create CSV writer
 */
export function createCsvWriter(filePath: string, headers: string[]) {
  return createObjectCsvWriter({
    path: filePath,
    header: headers.map((header) => ({
      id: header,
      title: header,
    })),
  });
}

/**
 * Calculate statistical confidence interval
 */
export function calculateConfidenceInterval(
  successes: number,
  total: number,
  confidenceLevel = 0.95
): ConfidenceInterval {
  if (total === 0) return { lower: 0, upper: 0, margin: 0 };

  const p = successes / total;
  const z = 1.96; // 95% confidence level

  const margin = z * Math.sqrt((p * (1 - p)) / total);

  return {
    lower: Math.max(0, p - margin),
    upper: Math.min(1, p + margin),
    margin,
  };
}

/**
 * Calculate required sample size for given confidence level and margin of error
 */
export function calculateRequiredSampleSize(
  confidenceLevel = 0.95,
  marginOfError = 0.05
): number {
  const z = 1.96; // 95% confidence level
  const p = 0.5; // Conservative estimate

  return Math.ceil((z * z * p * (1 - p)) / (marginOfError * marginOfError));
}

/**
 * Format bytes to human readable format
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 Bytes";

  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

/**
 * Format duration in milliseconds to human readable format
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3600000) return `${(ms / 60000).toFixed(1)}m`;
  return `${(ms / 3600000).toFixed(1)}h`;
}

/**
 * Generate a unique identifier
 */
export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

/**
 * Check if a file path matches any of the given patterns
 */
export function matchesPattern(filePath: string, patterns: string[]): boolean {
  return patterns.some((pattern) => {
    const regex = new RegExp(
      pattern.replace(/\*\*/g, ".*").replace(/\*/g, "[^/]*")
    );
    return regex.test(filePath);
  });
}

/**
 * Filter files based on patterns and size
 */
export function filterFiles(
  files: FileInfo[],
  includePatterns: string[],
  excludePatterns: string[],
  maxSize: number
): FileInfo[] {
  return files.filter((file) => {
    // Check if file matches include patterns
    const matchesInclude = includePatterns.some((pattern) =>
      matchesPattern(file.path, [pattern])
    );

    if (!matchesInclude) return false;

    // Check if file matches exclude patterns
    const matchesExclude = excludePatterns.some((pattern) =>
      matchesPattern(file.path, [pattern])
    );

    if (matchesExclude) return false;

    // Check file size
    if (file.size && file.size > maxSize) return false;

    return true;
  });
}

/**
 * Parse package.json to extract NextJS version and other relevant info
 */
export function parsePackageJson(content: string): PackageJsonInfo {
  try {
    const pkg = JSON.parse(content) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
      scripts?: Record<string, string>;
    };

    const nextVersion = pkg.dependencies?.next || pkg.devDependencies?.next;
    const reactVersion = pkg.dependencies?.react || pkg.devDependencies?.react;

    return {
      hasNextJS: !!nextVersion,
      nextVersion,
      reactVersion,
      scripts: pkg.scripts || {},
      dependencies: pkg.dependencies || {},
      devDependencies: pkg.devDependencies || {},
    };
  } catch (error) {
    return {
      hasNextJS: false,
      error: (error as Error).message,
    };
  }
}

/**
 * Extract repository owner and name from full name
 */
export function parseRepositoryName(fullName: string): RepositoryInfo {
  const parts = fullName.split("/");
  return {
    owner: parts[0],
    name: parts[1],
  };
}
