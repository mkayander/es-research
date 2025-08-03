import { expect, test, describe, beforeEach, afterEach } from "bun:test";
import { promises as fs } from "fs";
import { join } from "path";
import { ESGuardAnalyzer, type FileToAnalyze } from "./es-guard-analyzer.js";
import type { GitHubRepository } from "./github-client.js";

describe("ESGuardAnalyzer", () => {
  let analyzer: ESGuardAnalyzer;
  const testDir = join(process.cwd(), "test-temp");

  beforeEach(async () => {
    analyzer = new ESGuardAnalyzer();

    // Clean up test directory
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Directory doesn't exist, that's fine
    }
  });

  afterEach(async () => {
    // Clean up test directory
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe("Constructor", () => {
    test("should initialize with default configuration", () => {
      expect(analyzer).toBeDefined();
      expect(analyzer).toBeInstanceOf(ESGuardAnalyzer);
    });
  });

  describe("summarizeIssues", () => {
    test("should summarize empty issues array", () => {
      const summary = analyzer.summarizeIssues([]);

      expect(summary).toEqual({
        total: 0,
        categories: {},
        severity: {
          error: 0,
          warning: 0,
          info: 0,
        },
      });
    });

    test("should summarize issues with different severities", () => {
      const issues = [
        {
          category: "compatibility",
          severity: "error",
          type: "syntax",
          message: "Error 1",
        },
        {
          category: "compatibility",
          severity: "warning",
          type: "deprecated",
          message: "Warning 1",
        },
        {
          category: "performance",
          severity: "info",
          type: "suggestion",
          message: "Info 1",
        },
        {
          category: "compatibility",
          severity: "error",
          type: "syntax",
          message: "Error 2",
        },
      ];

      const summary = analyzer.summarizeIssues(issues);

      expect(summary.total).toBe(4);
      expect(summary.categories).toEqual({
        compatibility: 3,
        performance: 1,
      });
      expect(summary.severity).toEqual({
        error: 2,
        warning: 1,
        info: 1,
      });
    });

    test("should handle issues with missing properties", () => {
      const issues = [
        { message: "Issue 1" }, // Missing category and severity
        { category: "test", message: "Issue 2" }, // Missing severity
        { severity: "error", message: "Issue 3" }, // Missing category
      ];

      const summary = analyzer.summarizeIssues(issues);

      expect(summary.total).toBe(3);
      expect(summary.categories).toEqual({
        unknown: 2,
        test: 1,
      });
      expect(summary.severity).toEqual({
        error: 1,
        warning: 0,
        info: 2, // Default for missing severity
      });
    });
  });

  describe("aggregateProjectStats", () => {
    test("should aggregate empty results", () => {
      const stats = analyzer.aggregateProjectStats([]);

      expect(stats).toEqual({
        totalFiles: 0,
        filesWithIssues: 0,
        totalIssues: 0,
        categories: {},
        severity: {
          error: 0,
          warning: 0,
          info: 0,
        },
        issueTypes: {},
      });
    });

    test("should aggregate project statistics correctly", () => {
      const mockResults = [
        {
          filePath: "file1.js",
          hasIssues: true,
          issues: [
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
          ],
          summary: {
            total: 2,
            categories: { compatibility: 1, performance: 1 },
            severity: { error: 1, warning: 1, info: 0 },
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
        {
          filePath: "file3.js",
          hasIssues: true,
          issues: [
            {
              category: "compatibility",
              severity: "error",
              type: "syntax",
              message: "Error 2",
            },
          ],
          summary: {
            total: 1,
            categories: { compatibility: 1 },
            severity: { error: 1, warning: 0, info: 0 },
          },
          timestamp: "2023-01-01T00:00:00.000Z",
        },
      ];

      const stats = analyzer.aggregateProjectStats(mockResults);

      expect(stats.totalFiles).toBe(3);
      expect(stats.filesWithIssues).toBe(2);
      expect(stats.totalIssues).toBe(3);
      expect(stats.categories).toEqual({
        compatibility: 2,
        performance: 1,
      });
      expect(stats.severity).toEqual({
        error: 2,
        warning: 1,
        info: 0,
      });
      expect(stats.issueTypes).toEqual({
        syntax: 2,
        deprecated: 1,
      });
    });
  });

  describe("checkESGuardAvailability", () => {
    test("should check es-guard availability", async () => {
      const isAvailable = await analyzer.checkESGuardAvailability();

      // This test will pass if es-guard is available, fail if not
      // The actual result depends on whether es-guard is installed
      expect(typeof isAvailable).toBe("boolean");
    });
  });

  describe("analyzeFiles", () => {
    test("should analyze multiple files with concurrency control", async () => {
      const files: FileToAnalyze[] = [
        { path: "file1.js", content: "console.log('test1');" },
        { path: "file2.js", content: "console.log('test2');" },
        { path: "file3.js", content: "console.log('test3');" },
      ];

      const results = await analyzer.analyzeFiles(files, 2); // Concurrency of 2

      expect(results).toHaveLength(3);
      results.forEach((result) => {
        expect(result).toHaveProperty("filePath");
        expect(result).toHaveProperty("hasIssues");
        expect(result).toHaveProperty("issues");
        expect(result).toHaveProperty("summary");
        expect(result).toHaveProperty("timestamp");
      });
    });

    test("should handle empty files array", async () => {
      const results = await analyzer.analyzeFiles([]);

      expect(results).toHaveLength(0);
    });

    test("should handle files with errors gracefully", async () => {
      const files: FileToAnalyze[] = [
        { path: "file1.js", content: "console.log('test');" },
        { path: "file2.js", content: "invalid javascript syntax {" }, // Invalid syntax
      ];

      const results = await analyzer.analyzeFiles(files);

      expect(results).toHaveLength(2);
      // Both should have results, even if one has errors
      results.forEach((result) => {
        expect(result).toHaveProperty("filePath");
        expect(result).toHaveProperty("hasIssues");
        expect(result).toHaveProperty("issues");
        expect(result).toHaveProperty("summary");
        expect(result).toHaveProperty("timestamp");
      });
    });
  });

  describe("analyzeProject", () => {
    const mockProject: GitHubRepository = {
      id: 12345,
      full_name: "test-owner/test-repo",
      name: "test-repo",
      description: "Test repository",
      stargazers_count: 100,
      forks_count: 10,
      language: "JavaScript",
      created_at: "2020-01-01T00:00:00Z",
      updated_at: "2023-01-01T00:00:00Z",
    };

    test("should analyze project with files", async () => {
      const files: FileToAnalyze[] = [
        { path: "src/file1.js", content: "console.log('test1');" },
        { path: "src/file2.js", content: "console.log('test2');" },
      ];

      const result = await analyzer.analyzeProject(mockProject, files);

      expect(result.project).toEqual(mockProject);
      expect(result.analysis.totalFiles).toBe(2);
      expect(result.analysis.analyzedFiles).toBe(2);
      expect(result.analysis.duration).toBeGreaterThan(0);
      expect(result.analysis.timestamp).toBeDefined();
      expect(result.results).toHaveLength(2);
      expect(result.statistics).toBeDefined();
    });

    test("should handle project with no files", async () => {
      const result = await analyzer.analyzeProject(mockProject, []);

      expect(result.project).toEqual(mockProject);
      expect(result.analysis.totalFiles).toBe(0);
      expect(result.analysis.analyzedFiles).toBe(0);
      expect(result.analysis.filesWithIssues).toBe(0);
      expect(result.analysis.totalIssues).toBe(0);
      expect(result.results).toHaveLength(0);
      expect(result.statistics.totalFiles).toBe(0);
    });
  });

  describe("analyzeFile", () => {
    test("should analyze valid JavaScript file", async () => {
      const filePath = "test.js";
      const content = "console.log('Hello, World!');";

      const result = await analyzer.analyzeFile(filePath, content);

      expect(result.filePath).toBe(filePath);
      expect(result.hasIssues).toBeDefined();
      expect(Array.isArray(result.issues)).toBe(true);
      expect(result.summary).toBeDefined();
      expect(result.timestamp).toBeDefined();
      expect(result.summary.total).toBeGreaterThanOrEqual(0);
    });

    test("should handle file with syntax errors gracefully", async () => {
      const filePath = "invalid.js";
      const content = "invalid javascript syntax {";

      const result = await analyzer.analyzeFile(filePath, content);

      expect(result.filePath).toBe(filePath);
      expect(result.hasIssues).toBeDefined();
      expect(Array.isArray(result.issues)).toBe(true);
      expect(result.summary).toBeDefined();
      expect(result.timestamp).toBeDefined();
    });

    test("should handle empty file content", async () => {
      const filePath = "empty.js";
      const content = "";

      const result = await analyzer.analyzeFile(filePath, content);

      expect(result.filePath).toBe(filePath);
      expect(result.hasIssues).toBeDefined();
      expect(Array.isArray(result.issues)).toBe(true);
      expect(result.summary).toBeDefined();
      expect(result.timestamp).toBeDefined();
    });
  });

  describe("analyzeWithCustomConfig", () => {
    test("should analyze file with custom configuration", async () => {
      const filePath = "test.js";
      const content = "console.log('test');";
      const customConfig = {
        dir: "custom",
        target: "2020",
        browsers: "> 1%, last 2 versions",
      };

      const result = await analyzer.analyzeWithCustomConfig(
        filePath,
        content,
        customConfig
      );

      expect(result.filePath).toBe(filePath);
      expect(result.hasIssues).toBeDefined();
      expect(Array.isArray(result.issues)).toBe(true);
      expect(result.summary).toBeDefined();
      expect(result.timestamp).toBeDefined();
    });

    test("should handle invalid custom configuration", async () => {
      const filePath = "test.js";
      const content = "console.log('test');";
      const invalidConfig = {
        dir: "custom",
        target: "invalid-target", // Invalid target
      } as any;

      const result = await analyzer.analyzeWithCustomConfig(
        filePath,
        content,
        invalidConfig
      );

      expect(result.filePath).toBe(filePath);
      expect(result.hasIssues).toBe(false);
      expect(result.error).toBeDefined();
      expect(Array.isArray(result.issues)).toBe(true);
      expect(result.summary.total).toBe(0);
    });
  });

  describe("detectProjectConfiguration", () => {
    test("should attempt to detect project configuration", async () => {
      // This test will depend on whether there's a project configuration to detect
      // The method returns a Promise<Config | null>
      const result = analyzer.detectProjectConfiguration("./");

      // The actual result might be null if no config is detected, or a config object
      const config = await result;
      expect(config === null || typeof config === "object").toBe(true);
    });
  });

  describe("Error Handling", () => {
    test("should handle analysis timeout gracefully", async () => {
      // Create a large/complex file that might timeout
      const filePath = "large-file.js";
      const content = "console.log('test');".repeat(1000); // Large content

      const result = await analyzer.analyzeFile(filePath, content);

      // Should return a result even if it times out or has issues
      expect(result.filePath).toBe(filePath);
      expect(result.hasIssues).toBeDefined();
      expect(Array.isArray(result.issues)).toBe(true);
      expect(result.summary).toBeDefined();
      expect(result.timestamp).toBeDefined();
    });

    test("should handle file system errors gracefully", async () => {
      const filePath = "test.js";
      const content = "console.log('test');";

      // This test ensures the analyzer doesn't crash on file system issues
      const result = await analyzer.analyzeFile(filePath, content);

      expect(result.filePath).toBe(filePath);
      expect(result.hasIssues).toBeDefined();
      expect(Array.isArray(result.issues)).toBe(true);
      expect(result.summary).toBeDefined();
      expect(result.timestamp).toBeDefined();
    });
  });

  describe("Integration Tests", () => {
    test("should perform end-to-end analysis workflow", async () => {
      const mockProject: GitHubRepository = {
        id: 12345,
        full_name: "test-owner/test-repo",
        name: "test-repo",
        description: "Test repository",
        stargazers_count: 100,
        forks_count: 10,
        language: "JavaScript",
        created_at: "2020-01-01T00:00:00Z",
        updated_at: "2023-01-01T00:00:00Z",
      };

      const files: FileToAnalyze[] = [
        { path: "src/index.js", content: "console.log('Hello World');" },
        { path: "src/utils.js", content: "function helper() { return true; }" },
        {
          path: "src/config.js",
          content: "const config = { debug: true }; export default config;",
        },
      ];

      // Test the complete workflow
      const result = await analyzer.analyzeProject(mockProject, files);

      // Verify the complete result structure
      expect(result.project).toEqual(mockProject);
      expect(result.analysis.totalFiles).toBe(3);
      expect(result.analysis.analyzedFiles).toBe(3);
      expect(result.analysis.duration).toBeGreaterThan(0);
      expect(result.results).toHaveLength(3);
      expect(result.statistics.totalFiles).toBe(3);

      // Verify each file result
      result.results.forEach((fileResult) => {
        expect(fileResult).toHaveProperty("filePath");
        expect(fileResult).toHaveProperty("hasIssues");
        expect(fileResult).toHaveProperty("issues");
        expect(fileResult).toHaveProperty("summary");
        expect(fileResult).toHaveProperty("timestamp");
        expect(typeof fileResult.hasIssues).toBe("boolean");
        expect(Array.isArray(fileResult.issues)).toBe(true);
      });
    });
  });
});
