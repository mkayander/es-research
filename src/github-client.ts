import { Octokit } from "octokit";
import { config } from "./config.js";
import { sleep, retry } from "./utils.js";
import chalk from "chalk";

export interface GitHubRepository {
  id: number;
  name: string;
  full_name: string;
  description: string | null;
  stargazers_count: number;
  forks_count: number;
  language: string | null;
  created_at: string;
  updated_at: string;
  clone_url: string;
  default_branch: string;
}

// Type for GitHub API response items
export interface GitHubSearchItem {
  repository: {
    id: number;
    name: string;
    full_name: string;
    description: string | null;
    stargazers_count: number | undefined;
    forks_count: number | undefined;
    language: string | null | undefined;
    created_at: string | undefined;
    updated_at: string | undefined;
    clone_url: string | undefined;
    default_branch: string | undefined;
  };
}

export interface GitHubContent {
  type: "file" | "dir" | "submodule" | "symlink";
  name: string;
  path: string;
  size?: number;
  content?: string;
  encoding?: string;
}

export interface RateLimitInfo {
  resources: {
    core: {
      limit: number;
      remaining: number;
      reset: number;
    };
  };
}

export class GitHubClient {
  private octokit: Octokit;
  private rateLimitInfo: RateLimitInfo | null;

  constructor() {
    this.octokit = new Octokit({
      auth: config.github.token,
      baseUrl: config.github.baseUrl,
      userAgent: config.github.userAgent,
    });

    this.rateLimitInfo = null;
  }

  /**
   * Get language filters for GitHub search queries
   * Returns separate filters for JavaScript and TypeScript
   */
  private getLanguageFilters(): string[] {
    return ["language:javascript", "language:typescript"];
  }

  /**
   * Search for popular NextJS projects on GitHub
   * Uses multiple search strategies to get a comprehensive sample
   */
  async searchNextJSProjects(
    limit = config.research.sampleSize
  ): Promise<GitHubRepository[]> {
    const projects = new Map<string, GitHubRepository>();

    // Multiple search strategies for better coverage
    const strategies = [
      this.searchByPackageJson.bind(this),
      this.searchByNextJSFramework.bind(this),
      this.searchByPopularKeywords.bind(this),
    ];

    for (const strategy of strategies) {
      if (projects.size >= limit) break;

      try {
        console.log(chalk.gray(`Trying search strategy: ${strategy.name}`));
        const results = await strategy(limit - projects.size);
        console.log(chalk.gray(`Strategy found ${results.length} projects`));

        for (const project of results) {
          if (!projects.has(project.full_name)) {
            projects.set(project.full_name, project);
          }
        }

        // Respect rate limits
        await this.checkRateLimit();
      } catch (error) {
        console.warn(`Strategy failed: ${(error as Error).message}`);
      }
    }

    const allProjects = Array.from(projects.values());

    // Validate that projects actually have NextJS dependencies
    console.log(
      chalk.blue(
        `\n🔍 Validating ${allProjects.length} projects for NextJS dependencies...`
      )
    );
    const validProjects = await this.filterValidNextJSProjects(allProjects);

    return validProjects.slice(0, limit);
  }

  /**
   * Search for projects that explicitly mention NextJS in their description or topics
   */
  async searchByNextJSFramework(limit: number): Promise<GitHubRepository[]> {
    console.log(chalk.blue("Searching by NextJS framework"), { limit });

    const languageFilters = this.getLanguageFilters();
    const queries = [
      // More specific queries to avoid false positives
      `"nextjs" "framework" stars:>${config.research.searchCriteria.minStars} forks:>${config.research.searchCriteria.minForks}`,
      `"next.js" "framework" stars:>${config.research.searchCriteria.minStars} forks:>${config.research.searchCriteria.minForks}`,
      `"nextjs" "starter" stars:>${config.research.searchCriteria.minStars} forks:>${config.research.searchCriteria.minForks}`,
      `"next.js" "starter" stars:>${config.research.searchCriteria.minStars} forks:>${config.research.searchCriteria.minForks}`,
    ];

    // Add language-specific queries
    for (const languageFilter of languageFilters) {
      queries.push(
        `"nextjs" ${languageFilter} stars:>${config.research.searchCriteria.minStars} forks:>${config.research.searchCriteria.minForks}`
      );
      queries.push(
        `"next.js" ${languageFilter} stars:>${config.research.searchCriteria.minStars} forks:>${config.research.searchCriteria.minForks}`
      );
    }

    const results: GitHubRepository[] = [];

    for (const query of queries) {
      if (results.length >= limit) break;

      try {
        const response = await retry(async () => {
          return await this.octokit.rest.search.repos({
            q: query,
            sort: "stars",
            order: "desc",
            per_page: Math.min(100, limit - results.length),
          });
        });

        console.log(
          chalk.gray(
            `Query "${query}" returned ${response.data.items.length} results`
          )
        );
        results.push(...response.data.items);
      } catch (error) {
        console.warn(
          chalk.yellow(
            `Failed to search with query "${query}": ${
              (error as Error).message
            }`
          )
        );
      }

      await sleep(1000); // Rate limiting
    }

    return results;
  }

  /**
   * Search for projects with NextJS in package.json
   */
  async searchByPackageJson(limit: number): Promise<GitHubRepository[]> {
    console.log(chalk.blue("Searching by package.json"), { limit });

    const languageFilters = this.getLanguageFilters();
    const repos = new Map<string, GitHubRepository>();

    for (const languageFilter of languageFilters) {
      // More specific queries to find actual NextJS projects
      const query = `path:**/package.json next ${languageFilter} stars:>${config.research.searchCriteria.minStars} forks:>${config.research.searchCriteria.minForks}`;

      try {
        const response = await retry(async () => {
          return await this.octokit.rest.search.code({
            q: query,
            sort: "indexed",
            order: "desc",
            per_page: Math.min(100, limit),
          });
        });

        console.log(
          chalk.gray(
            `Query "${query}" returned ${response.data.items.length} results`
          )
        );

        // Extract repository information from code search results
        for (const item of response.data.items) {
          const repoKey = item.repository.full_name;
          if (!repos.has(repoKey)) {
            repos.set(repoKey, {
              id: item.repository.id,
              name: item.repository.name,
              full_name: item.repository.full_name,
              description: item.repository.description,
              stargazers_count: item.repository.stargazers_count ?? 0,
              forks_count: item.repository.forks_count ?? 0,
              language: item.repository.language ?? null,
              created_at: item.repository.created_at ?? "",
              updated_at: item.repository.updated_at ?? "",
              clone_url: item.repository.clone_url ?? "",
              default_branch: item.repository.default_branch ?? "main",
            });
          }
        }
      } catch (error) {
        console.warn(
          chalk.yellow(
            `Failed to search with query "${query}": ${
              (error as Error).message
            }`
          )
        );
      }

      await sleep(1000); // Rate limiting
    }

    return Array.from(repos.values());
  }

  /**
   * Search by popular NextJS-related keywords
   */
  async searchByPopularKeywords(limit: number): Promise<GitHubRepository[]> {
    console.log(chalk.blue("Searching by popular keywords"), { limit });

    const keywords = [
      '"nextjs starter"',
      '"next.js template"',
      '"nextjs boilerplate"',
      '"next.js app"',
      '"nextjs example"',
      '"next.js example"',
      '"nextjs project"',
      '"next.js project"',
    ];

    const results: GitHubRepository[] = [];
    const languageFilters = this.getLanguageFilters();

    for (const keyword of keywords) {
      if (results.length >= limit) break;

      for (const languageFilter of languageFilters) {
        if (results.length >= limit) break;

        const query = `${keyword} ${languageFilter} stars:>${config.research.searchCriteria.minStars} forks:>${config.research.searchCriteria.minForks}`;

        try {
          const response = await retry(async () => {
            return await this.octokit.rest.search.repos({
              q: query,
              sort: "stars",
              order: "desc",
              per_page: Math.min(100, limit - results.length),
            });
          });

          console.log(
            chalk.gray(
              `Query "${query}" returned ${response.data.items.length} results`
            )
          );
          results.push(...response.data.items);
        } catch (error) {
          console.warn(
            chalk.yellow(
              `Failed to search with query "${query}": ${
                (error as Error).message
              }`
            )
          );
        }

        await sleep(1000);
      }
    }

    return results;
  }

  /**
   * Get detailed repository information
   */
  async getRepositoryDetails(
    owner: string,
    repo: string
  ): Promise<GitHubRepository> {
    return await retry(async () => {
      const response = await this.octokit.rest.repos.get({
        owner,
        repo,
      });
      return response.data;
    });
  }

  /**
   * Get repository contents for a specific path
   */
  async getRepositoryContents(
    owner: string,
    repo: string,
    path = ""
  ): Promise<GitHubContent[] | null> {
    try {
      const response = await this.octokit.rest.repos.getContent({
        owner,
        repo,
        path,
      });
      return Array.isArray(response.data) ? response.data : [response.data];
    } catch (error) {
      if ((error as { status?: number }).status === 404) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Get file content
   */
  async getFileContent(
    owner: string,
    repo: string,
    path: string
  ): Promise<string | null> {
    try {
      const response = await this.octokit.rest.repos.getContent({
        owner,
        repo,
        path,
      });

      // Handle single file response
      if (!Array.isArray(response.data) && response.data.type === "file") {
        return Buffer.from(response.data.content, "base64").toString("utf-8");
      }

      return null;
    } catch (error) {
      if ((error as { status?: number }).status === 404) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Check and handle rate limiting
   */
  async checkRateLimit(): Promise<void> {
    try {
      const response = await this.octokit.rest.rateLimit.get();
      this.rateLimitInfo = response.data;

      const core = this.rateLimitInfo.resources.core;
      if (core.remaining < 10) {
        const resetTime = new Date(core.reset * 1000);
        const waitTime = resetTime.getTime() - Date.now() + 60000; // Add 1 minute buffer

        if (waitTime > 0) {
          console.log(
            `Rate limit approaching. Waiting ${Math.ceil(
              waitTime / 1000
            )} seconds...`
          );
          await sleep(waitTime);
        }
      }
    } catch (error) {
      console.warn("Could not check rate limit:", (error as Error).message);
    }
  }

  /**
   * Get rate limit information
   */
  getRateLimitInfo(): RateLimitInfo | null {
    return this.rateLimitInfo;
  }

  /**
   * Test GitHub API connection
   */
  async testConnection(): Promise<{
    success: boolean;
    message: string;
    totalCount?: number;
  }> {
    try {
      const response = await this.octokit.rest.search.repos({
        q: "nextjs stars:>1000",
        sort: "stars",
        order: "desc",
        per_page: 5,
      });

      return {
        success: true,
        message: `Found ${response.data.total_count} repositories`,
        totalCount: response.data.total_count,
      };
    } catch (error) {
      return {
        success: false,
        message: (error as Error).message,
      };
    }
  }

  /**
   * Validate that a repository is actually a NextJS project
   * by checking its package.json for NextJS dependencies
   */
  async validateNextJSProject(
    owner: string,
    repo: string
  ): Promise<{ isValid: boolean; nextVersion?: string; reason?: string }> {
    try {
      // Try to get package.json content
      const packageJsonContent = await this.getFileContent(
        owner,
        repo,
        "package.json"
      );

      if (!packageJsonContent) {
        return { isValid: false, reason: "No package.json found" };
      }

      // Parse package.json
      const packageJson = JSON.parse(packageJsonContent) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };

      // Check for NextJS in dependencies or devDependencies
      const allDeps = {
        ...packageJson.dependencies,
        ...packageJson.devDependencies,
      };

      // Look for NextJS package - only "next" is valid
      const nextJSKeys = Object.keys(allDeps).filter((key) => key === "next");

      if (nextJSKeys.length === 0) {
        return { isValid: false, reason: "No NextJS dependencies found" };
      }

      // Get the NextJS version
      const nextKey = nextJSKeys[0];
      const nextVersion = nextKey ? allDeps[nextKey] : undefined;

      return {
        isValid: true,
        ...(nextVersion && { nextVersion }),
        reason: `Found NextJS dependency: ${nextKey}@${nextVersion}`,
      };
    } catch (error) {
      return {
        isValid: false,
        reason: `Error validating project: ${(error as Error).message}`,
      };
    }
  }

  /**
   * Filter and validate NextJS projects
   */
  async filterValidNextJSProjects(
    projects: GitHubRepository[],
    maxConcurrent = 5
  ): Promise<GitHubRepository[]> {
    console.log(
      chalk.blue(
        `Validating ${projects.length} projects for NextJS dependencies...`
      )
    );

    const validProjects: GitHubRepository[] = [];
    const batchSize = maxConcurrent;

    for (let i = 0; i < projects.length; i += batchSize) {
      const batch = projects.slice(i, i + batchSize);
      const promises = batch.map(async (project) => {
        const [owner, repo] = project.full_name.split("/");
        if (!owner || !repo) {
          console.log(
            chalk.gray(
              `❌ ${project.full_name}: Invalid repository name format`
            )
          );
          return null;
        }
        const validation = await this.validateNextJSProject(owner, repo);

        if (validation.isValid) {
          console.log(
            chalk.gray(`✅ ${project.full_name}: ${validation.reason}`)
          );
          return project;
        } else {
          console.log(
            chalk.gray(`❌ ${project.full_name}: ${validation.reason}`)
          );
          return null;
        }
      });

      const results = await Promise.all(promises);
      validProjects.push(
        ...results.filter((p): p is GitHubRepository => p !== null)
      );

      // Rate limiting between batches
      if (i + batchSize < projects.length) {
        await sleep(2000);
      }
    }

    console.log(
      chalk.green(
        `✅ Validated ${projects.length} projects, found ${validProjects.length} valid NextJS projects`
      )
    );
    return validProjects;
  }
}
