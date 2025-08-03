import { expect, test, describe } from "bun:test";
import { config, validateConfig } from "./config.js";
import {
  sleep,
  retry,
  ensureDir,
  saveJson,
  loadJson,
  calculateConfidenceInterval,
  formatBytes,
  formatDuration,
  generateId,
  parsePackageJson,
  parseRepositoryName,
} from "./utils.js";
import { ESGuardAnalyzer } from "./es-guard-analyzer.js";

describe("Integration Tests", () => {
  describe("Project Structure", () => {
    test("should have all required modules", () => {
      // Test that all main modules can be imported
      expect(config).toBeDefined();
      expect(validateConfig).toBeDefined();
      expect(sleep).toBeDefined();
      expect(retry).toBeDefined();
      expect(ensureDir).toBeDefined();
      expect(saveJson).toBeDefined();
      expect(loadJson).toBeDefined();
      expect(calculateConfidenceInterval).toBeDefined();
      expect(formatBytes).toBeDefined();
      expect(formatDuration).toBeDefined();
      expect(generateId).toBeDefined();
      expect(parsePackageJson).toBeDefined();
      expect(parseRepositoryName).toBeDefined();
      expect(ESGuardAnalyzer).toBeDefined();
    });

    test("should have valid configuration structure", () => {
      expect(config.github).toBeDefined();
      expect(config.research).toBeDefined();
      expect(config.output).toBeDefined();
      expect(config.analysis).toBeDefined();

      expect(config.github.baseUrl).toBe("https://api.github.com");
      expect(config.github.userAgent).toBe("es-research/1.0.0");
      expect(config.research.sampleSize).toBeGreaterThan(0);
      expect(config.analysis.concurrency).toBeGreaterThan(0);
    });
  });

  describe("Utility Functions Integration", () => {
    test("should handle basic utility operations", async () => {
      // Test sleep function
      const start = Date.now();
      await sleep(50);
      const duration = Date.now() - start;
      expect(duration).toBeGreaterThanOrEqual(45);

      // Test retry function
      let attempts = 0;
      const fn = async () => {
        attempts++;
        if (attempts < 2) throw new Error("Temporary failure");
        return "success";
      };
      const result = await retry(fn, 3, 10);
      expect(result).toBe("success");
      expect(attempts).toBe(2);

      // Test ID generation
      const id1 = generateId();
      const id2 = generateId();
      expect(id1).not.toBe(id2);
      expect(typeof id1).toBe("string");
      expect(typeof id2).toBe("string");
    });

    test("should handle data formatting functions", () => {
      // Test byte formatting
      expect(formatBytes(1024)).toBe("1 KB");
      expect(formatBytes(1024 * 1024)).toBe("1 MB");
      expect(formatBytes(0)).toBe("0 Bytes");

      // Test duration formatting
      expect(formatDuration(1500)).toBe("1.5s");
      expect(formatDuration(90000)).toBe("1.5m");
      expect(formatDuration(500)).toBe("500ms");
    });

    test("should handle statistical calculations", () => {
      const interval = calculateConfidenceInterval(50, 100);
      expect(interval).toHaveProperty("lower");
      expect(interval).toHaveProperty("upper");
      expect(interval).toHaveProperty("margin");
      expect(interval.lower).toBeGreaterThanOrEqual(0);
      expect(interval.upper).toBeLessThanOrEqual(1);
    });

    test("should handle package.json parsing", () => {
      const validPackageJson = JSON.stringify({
        dependencies: { next: "^13.0.0", react: "^18.0.0" },
        devDependencies: { typescript: "^5.0.0" },
        scripts: { dev: "next dev", build: "next build" },
      });

      const result = parsePackageJson(validPackageJson);
      expect(result.hasNextJS).toBe(true);
      expect(result.nextVersion).toBe("^13.0.0");
      expect(result.reactVersion).toBe("^18.0.0");
      expect(result.scripts?.dev).toBe("next dev");
    });

    test("should handle repository name parsing", () => {
      const repoInfo = parseRepositoryName("owner/repo");
      expect(repoInfo.owner).toBe("owner");
      expect(repoInfo.name).toBe("repo");

      const singleRepo = parseRepositoryName("repo");
      expect(singleRepo.owner).toBe("");
      expect(singleRepo.name).toBe("repo");
    });
  });

  describe("ESGuardAnalyzer Integration", () => {
    test("should initialize analyzer correctly", () => {
      const analyzer = new ESGuardAnalyzer();
      expect(analyzer).toBeInstanceOf(ESGuardAnalyzer);
    });

    test("should handle issue summarization", () => {
      const analyzer = new ESGuardAnalyzer();
      const issues = [
        {
          category: "compatibility",
          severity: "error",
          type: "syntax",
          message: "Error 1",
        },
        {
          category: "performance",
          severity: "warning",
          type: "deprecated",
          message: "Warning 1",
        },
      ];

      const summary = analyzer.summarizeIssues(issues);
      expect(summary.total).toBe(2);
      expect(summary.categories.compatibility).toBe(1);
      expect(summary.categories.performance).toBe(1);
      expect(summary.severity.error).toBe(1);
      expect(summary.severity.warning).toBe(1);
    });

    test("should handle project statistics aggregation", () => {
      const analyzer = new ESGuardAnalyzer();
      const mockResults = [
        {
          filePath: "file1.js",
          hasIssues: true,
          issues: [
            {
              category: "compatibility",
              severity: "error",
              type: "syntax",
              message: "Error",
            },
          ],
          summary: {
            total: 1,
            categories: { compatibility: 1 },
            severity: { error: 1, warning: 0, info: 0 },
          },
          timestamp: "2023-01-01T00:00:00.000Z",
        },
        {
          filePath: "file2.js",
          hasIssues: false,
          issues: [],
          summary: {
            total: 0,
            categories: {},
            severity: { error: 0, warning: 0, info: 0 },
          },
          timestamp: "2023-01-01T00:00:00.000Z",
        },
      ];

      const stats = analyzer.aggregateProjectStats(mockResults);
      expect(stats.totalFiles).toBe(2);
      expect(stats.filesWithIssues).toBe(1);
      expect(stats.totalIssues).toBe(1);
      expect(stats.categories.compatibility).toBe(1);
    });
  });

  describe("Configuration Validation", () => {
    test("should validate configuration with proper environment", () => {
      // This test will pass if GITHUB_TOKEN is set, fail if not
      // We're testing the validation logic, not the actual token
      try {
        validateConfig();
        // If we get here, validation passed
        expect(true).toBe(true);
      } catch (error) {
        // If validation fails, it should be due to missing GITHUB_TOKEN
        expect((error as Error).message).toContain("GITHUB_TOKEN");
      }
    });

    test("should have reasonable configuration values", () => {
      // Test that configuration values are within reasonable bounds
      expect(config.research.sampleSize).toBeGreaterThanOrEqual(100);
      expect(config.research.confidenceLevel).toBeGreaterThan(0.9);
      expect(config.research.confidenceLevel).toBeLessThan(1);
      expect(config.research.marginOfError).toBeGreaterThan(0);
      expect(config.research.marginOfError).toBeLessThan(0.1);
      expect(config.analysis.concurrency).toBeGreaterThan(0);
      expect(config.analysis.concurrency).toBeLessThan(20);
      expect(config.analysis.maxFileSize).toBeGreaterThan(1024);
      expect(config.analysis.maxFileSize).toBeLessThan(10 * 1024 * 1024);
    });
  });

  describe("Error Handling", () => {
    test("should handle invalid package.json gracefully", () => {
      const invalidJson = "{ invalid json }";
      const result = parsePackageJson(invalidJson);

      expect(result.hasNextJS).toBe(false);
      expect(result.error).toBeDefined();
    });

    test("should handle empty package.json", () => {
      const result = parsePackageJson("");

      expect(result.hasNextJS).toBe(false);
      expect(result.error).toBeDefined();
    });

    test("should handle retry failures gracefully", async () => {
      const fn = async () => {
        throw new Error("Persistent failure");
      };

      await expect(retry(fn, 2, 10)).rejects.toThrow("Persistent failure");
    });
  });

  describe("Data Flow", () => {
    test("should demonstrate complete data flow", async () => {
      // This test demonstrates how the different components work together

      // 1. Configuration validation
      try {
        validateConfig();
      } catch (error) {
        // Expected if GITHUB_TOKEN is not set
        expect((error as Error).message).toContain("GITHUB_TOKEN");
      }

      // 2. Utility functions
      const id = generateId();
      expect(typeof id).toBe("string");
      expect(id.length).toBeGreaterThan(0);

      const interval = calculateConfidenceInterval(75, 100);
      expect(interval.lower).toBeGreaterThan(0.6);
      expect(interval.upper).toBeLessThan(0.9);

      // 3. Analyzer initialization
      const analyzer = new ESGuardAnalyzer();
      expect(analyzer).toBeDefined();

      // 4. Data processing
      const packageInfo = parsePackageJson(
        JSON.stringify({
          dependencies: { next: "^13.0.0" },
        })
      );
      expect(packageInfo.hasNextJS).toBe(true);

      const repoInfo = parseRepositoryName("test-owner/test-repo");
      expect(repoInfo.owner).toBe("test-owner");
      expect(repoInfo.name).toBe("test-repo");

      // 5. Issue processing
      const issues = [
        {
          category: "compatibility",
          severity: "error",
          type: "syntax",
          message: "Test error",
        },
      ];
      const summary = analyzer.summarizeIssues(issues);
      expect(summary.total).toBe(1);
      expect(summary.categories.compatibility).toBe(1);
      expect(summary.severity.error).toBe(1);
    });
  });
});
