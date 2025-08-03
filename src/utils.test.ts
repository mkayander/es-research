import { expect, test, describe, beforeEach, afterEach } from "bun:test";
import { promises as fs } from "fs";
import { join } from "path";
import {
  sleep,
  retry,
  ensureDir,
  saveJson,
  loadJson,
  saveYaml,
  loadYaml,
  createCsvWriter,
  calculateConfidenceInterval,
  calculateRequiredSampleSize,
  formatBytes,
  formatDuration,
  generateId,
  matchesPattern,
  filterFiles,
  parsePackageJson,
  parseRepositoryName,
  type FileInfo,
} from "./utils.js";

describe("Utils", () => {
  const testDir = join(process.cwd(), "test-temp");

  beforeEach(async () => {
    // Clean up test directory before each test
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Directory doesn't exist, that's fine
    }
  });

  afterEach(async () => {
    // Clean up test directory after each test
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe("sleep", () => {
    test("should sleep for specified milliseconds", async () => {
      const start = Date.now();
      await sleep(100);
      const end = Date.now();
      const duration = end - start;

      expect(duration).toBeGreaterThanOrEqual(95); // Allow small timing variance
    });
  });

  describe("retry", () => {
    test("should succeed on first attempt", async () => {
      let attempts = 0;
      const fn = async () => {
        attempts++;
        return "success";
      };

      const result = await retry(fn);
      expect(result).toBe("success");
      expect(attempts).toBe(1);
    });

    test("should retry and succeed after failures", async () => {
      let attempts = 0;
      const fn = async () => {
        attempts++;
        if (attempts < 3) {
          throw new Error("Temporary failure");
        }
        return "success";
      };

      const result = await retry(fn, 3, 10);
      expect(result).toBe("success");
      expect(attempts).toBe(3);
    });

    test("should throw after max retries", async () => {
      const fn = async () => {
        throw new Error("Persistent failure");
      };

      await expect(retry(fn, 2, 10)).rejects.toThrow("Persistent failure");
    });
  });

  describe("ensureDir", () => {
    test("should create directory if it doesn't exist", async () => {
      const dirPath = join(testDir, "new-dir");

      await ensureDir(dirPath);

      const exists = await fs
        .access(dirPath)
        .then(() => true)
        .catch(() => false);
      expect(exists).toBe(true);
    });

    test("should not fail if directory already exists", async () => {
      const dirPath = join(testDir, "existing-dir");

      // Create directory first
      await fs.mkdir(dirPath, { recursive: true });

      // Should not throw
      await expect(ensureDir(dirPath)).resolves.toBeUndefined();
    });
  });

  describe("saveJson and loadJson", () => {
    test("should save and load JSON data", async () => {
      const filePath = join(testDir, "test.json");
      const testData = { name: "test", value: 123, nested: { key: "value" } };

      await saveJson(filePath, testData);

      const loaded = await loadJson(filePath);
      expect(loaded).toEqual(testData);
    });

    test("should return null for non-existent file", async () => {
      const filePath = join(testDir, "nonexistent.json");

      const loaded = await loadJson(filePath);
      expect(loaded).toBeNull();
    });

    test("should throw for invalid JSON", async () => {
      const filePath = join(testDir, "invalid.json");

      // Ensure test directory exists
      await ensureDir(testDir);

      // Write invalid JSON
      await fs.writeFile(filePath, "{ invalid json }");

      // Should throw when trying to parse invalid JSON
      await expect(loadJson(filePath)).rejects.toThrow();
    });
  });

  describe("saveYaml and loadYaml", () => {
    test("should save and load YAML data", async () => {
      const filePath = join(testDir, "test.yaml");
      const testData = { name: "test", value: 123, nested: { key: "value" } };

      await saveYaml(filePath, testData);

      const loaded = await loadYaml(filePath);
      expect(loaded).toEqual(testData);
    });

    test("should return null for non-existent YAML file", async () => {
      const filePath = join(testDir, "nonexistent.yaml");

      const loaded = await loadYaml(filePath);
      expect(loaded).toBeNull();
    });
  });

  describe("createCsvWriter", () => {
    test("should create CSV writer with headers", () => {
      const filePath = join(testDir, "test.csv");
      const headers = ["name", "value", "description"];

      const writer = createCsvWriter(filePath, headers);

      expect(writer).toBeDefined();
      expect(typeof writer.writeRecords).toBe("function");
    });
  });

  describe("calculateConfidenceInterval", () => {
    test("should calculate confidence interval for valid data", () => {
      const result = calculateConfidenceInterval(50, 100);

      expect(result).toHaveProperty("lower");
      expect(result).toHaveProperty("upper");
      expect(result).toHaveProperty("margin");
      expect(result.lower).toBeGreaterThanOrEqual(0);
      expect(result.upper).toBeLessThanOrEqual(1);
      expect(result.margin).toBeGreaterThan(0);
    });

    test("should handle zero total", () => {
      const result = calculateConfidenceInterval(0, 0);

      expect(result).toEqual({ lower: 0, upper: 0, margin: 0 });
    });

    test("should handle edge cases", () => {
      const result1 = calculateConfidenceInterval(100, 100); // 100% success
      const result2 = calculateConfidenceInterval(0, 100); // 0% success

      expect(result1.lower).toBeGreaterThan(0.9);
      expect(result2.upper).toBeLessThan(0.1);
    });
  });

  describe("calculateRequiredSampleSize", () => {
    test("should calculate sample size for default margin of error", () => {
      const sampleSize = calculateRequiredSampleSize(0.05);

      expect(sampleSize).toBeGreaterThan(0);
      expect(sampleSize).toBeLessThan(10000); // Reasonable upper bound
    });

    test("should calculate sample size for different margin of error", () => {
      const sampleSize1 = calculateRequiredSampleSize(0.01); // 1% margin
      const sampleSize2 = calculateRequiredSampleSize(0.1); // 10% margin

      expect(sampleSize1).toBeGreaterThan(sampleSize2); // Smaller margin = larger sample
    });
  });

  describe("formatBytes", () => {
    test("should format bytes correctly", () => {
      expect(formatBytes(0)).toBe("0 Bytes");
      expect(formatBytes(1024)).toBe("1 KB");
      expect(formatBytes(1024 * 1024)).toBe("1 MB");
      expect(formatBytes(1024 * 1024 * 1024)).toBe("1 GB");
    });

    test("should handle decimal values", () => {
      const result = formatBytes(1536); // 1.5 KB
      expect(result).toMatch(/1\.5 KB/);
    });
  });

  describe("formatDuration", () => {
    test("should format duration correctly", () => {
      expect(formatDuration(500)).toBe("500ms");
      expect(formatDuration(1500)).toBe("1.5s");
      expect(formatDuration(90000)).toBe("1.5m");
      expect(formatDuration(7200000)).toBe("2.0h");
    });
  });

  describe("generateId", () => {
    test("should generate unique IDs", () => {
      const id1 = generateId();
      const id2 = generateId();

      expect(id1).toBeDefined();
      expect(id2).toBeDefined();
      expect(id1).not.toBe(id2);
      expect(typeof id1).toBe("string");
      expect(typeof id2).toBe("string");
    });
  });

  describe("matchesPattern", () => {
    test("should match simple patterns", () => {
      expect(matchesPattern("file.js", ["*.js"])).toBe(true);
      expect(matchesPattern("file.ts", ["*.js"])).toBe(false);
      expect(matchesPattern("src/file.js", ["**/*.js"])).toBe(true);
    });

    test("should match complex patterns", () => {
      expect(matchesPattern("src/components/Button.jsx", ["**/*.jsx"])).toBe(
        true
      );
      expect(matchesPattern("src/utils/helper.ts", ["**/*.ts"])).toBe(true);
      expect(matchesPattern("node_modules/file.js", ["**/*.js"])).toBe(true);
    });

    test("should handle multiple patterns", () => {
      const patterns = ["*.js", "*.ts", "*.jsx"];

      expect(matchesPattern("file.js", patterns)).toBe(true);
      expect(matchesPattern("file.ts", patterns)).toBe(true);
      expect(matchesPattern("file.jsx", patterns)).toBe(true);
      expect(matchesPattern("file.css", patterns)).toBe(false);
    });
  });

  describe("filterFiles", () => {
    const testFiles: FileInfo[] = [
      { path: "src/file.js", size: 1024 },
      { path: "src/file.ts", size: 2048 },
      { path: "src/file.jsx", size: 3072 },
      { path: "node_modules/file.js", size: 4096 },
      { path: "dist/file.js", size: 5120 },
      { path: "large-file.js", size: 2 * 1024 * 1024 }, // 2MB
    ];

    test("should filter files by include patterns", () => {
      const includePatterns = ["**/*.js", "**/*.ts"];
      const excludePatterns: string[] = [];
      const maxSize = 1024 * 1024; // 1MB

      const filtered = filterFiles(
        testFiles,
        includePatterns,
        excludePatterns,
        maxSize
      );

      // large-file.js is 2MB, so it should be excluded due to size limit
      // **/*.js pattern also matches .jsx files
      expect(filtered).toHaveLength(5); // All .js, .jsx, and .ts files under size limit
      expect(filtered.map((f) => f.path)).toEqual([
        "src/file.js",
        "src/file.ts",
        "src/file.jsx",
        "node_modules/file.js",
        "dist/file.js",
      ]);
    });

    test("should filter files by exclude patterns", () => {
      const includePatterns = ["**/*.js"];
      const excludePatterns = [
        "**/node_modules/**",
        "**/dist/**",
        "node_modules/**",
        "dist/**",
      ];
      const maxSize = 1024 * 1024;

      const filtered = filterFiles(
        testFiles,
        includePatterns,
        excludePatterns,
        maxSize
      );

      // Should exclude node_modules/file.js and dist/file.js, but include src/file.js and src/file.jsx
      expect(filtered).toHaveLength(2); // src/file.js and src/file.jsx (large-file.js is over size limit)
      expect(filtered.map((f) => f.path)).toEqual([
        "src/file.js",
        "src/file.jsx",
      ]);
    });

    test("should filter files by size", () => {
      const includePatterns = ["**/*.js"];
      const excludePatterns: string[] = [];
      const maxSize = 2048; // 2KB

      const filtered = filterFiles(
        testFiles,
        includePatterns,
        excludePatterns,
        maxSize
      );

      expect(filtered).toHaveLength(1); // Only src/file.js under 2KB
      expect(filtered[0].path).toBe("src/file.js");
    });
  });

  describe("parsePackageJson", () => {
    test("should parse valid package.json with NextJS", () => {
      const content = JSON.stringify({
        dependencies: {
          next: "^13.0.0",
          react: "^18.0.0",
        },
        devDependencies: {
          typescript: "^5.0.0",
        },
        scripts: {
          dev: "next dev",
          build: "next build",
        },
      });

      const result = parsePackageJson(content);

      expect(result.hasNextJS).toBe(true);
      expect(result.nextVersion).toBe("^13.0.0");
      expect(result.reactVersion).toBe("^18.0.0");
      expect(result.scripts?.dev).toBe("next dev");
      expect(result.dependencies?.next).toBe("^13.0.0");
      expect(result.devDependencies?.typescript).toBe("^5.0.0");
    });

    test("should parse package.json without NextJS", () => {
      const content = JSON.stringify({
        dependencies: {
          react: "^18.0.0",
        },
      });

      const result = parsePackageJson(content);

      expect(result.hasNextJS).toBe(false);
      expect(result.nextVersion).toBeUndefined();
      expect(result.reactVersion).toBe("^18.0.0");
    });

    test("should handle NextJS in devDependencies", () => {
      const content = JSON.stringify({
        devDependencies: {
          next: "^13.0.0",
        },
      });

      const result = parsePackageJson(content);

      expect(result.hasNextJS).toBe(true);
      expect(result.nextVersion).toBe("^13.0.0");
    });

    test("should handle invalid JSON", () => {
      const content = "{ invalid json }";

      const result = parsePackageJson(content);

      expect(result.hasNextJS).toBe(false);
      expect(result.error).toBeDefined();
    });

    test("should handle empty content", () => {
      const result = parsePackageJson("");

      expect(result.hasNextJS).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe("parseRepositoryName", () => {
    test("should parse valid repository name", () => {
      const result = parseRepositoryName("owner/repo");

      expect(result.owner).toBe("owner");
      expect(result.name).toBe("repo");
    });

    test("should handle repository name with multiple slashes", () => {
      const result = parseRepositoryName("owner/org/repo");

      expect(result.owner).toBe("owner");
      expect(result.name).toBe("org");
    });

    test("should handle single part name", () => {
      const result = parseRepositoryName("repo");

      expect(result.owner).toBe("");
      expect(result.name).toBe("repo");
    });

    test("should handle empty string", () => {
      const result = parseRepositoryName("");

      expect(result.owner).toBe("");
      expect(result.name).toBe("");
    });
  });
});
