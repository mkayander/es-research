import { Octokit } from "octokit";
import { config } from "./config.js";
import { sleep, retry } from "./utils.js";

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

export interface GitHubContent {
  type: "file" | "dir";
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
   * Search for popular NextJS projects on GitHub
   * Uses multiple search strategies to get a comprehensive sample
   */
  async searchNextJSProjects(
    limit = config.research.sampleSize
  ): Promise<GitHubRepository[]> {
    const projects = new Map<string, GitHubRepository>();

    // Strategy 1: Search by NextJS framework indicators
    const strategies = [
      this.searchByNextJSFramework.bind(this),
      this.searchByPackageJson.bind(this),
      this.searchByPopularKeywords.bind(this),
    ];

    for (const strategy of strategies) {
      if (projects.size >= limit) break;

      try {
        const results = await strategy(limit - projects.size);
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

    return Array.from(projects.values()).slice(0, limit);
  }

  /**
   * Search for projects that explicitly mention NextJS in their description or topics
   */
  async searchByNextJSFramework(limit: number): Promise<GitHubRepository[]> {
    const queries = [
      "nextjs framework:nextjs stars:>100 created:>2020-01-01",
      "next.js framework:nextjs stars:>100 created:>2020-01-01",
      "nextjs language:javascript stars:>100 forks:>10",
      "next.js language:javascript stars:>100 forks:>10",
    ];

    const results: GitHubRepository[] = [];

    for (const query of queries) {
      if (results.length >= limit) break;

      const response = await retry(async () => {
        return await this.octokit.rest.search.repos({
          q: query,
          sort: "stars",
          order: "desc",
          per_page: Math.min(100, limit - results.length),
        });
      });

      results.push(...response.data.items);
      await sleep(1000); // Rate limiting
    }

    return results;
  }

  /**
   * Search for projects with NextJS in package.json
   */
  async searchByPackageJson(limit: number): Promise<GitHubRepository[]> {
    const query =
      'filename:package.json "next": language:javascript stars:>100 created:>2020-01-01';

    const response = await retry(async () => {
      return await this.octokit.rest.search.code({
        q: query,
        sort: "indexed",
        order: "desc",
        per_page: Math.min(100, limit),
      });
    });

    // Extract repository information from code search results
    const repos = new Map<string, GitHubRepository>();
    for (const item of response.data.items) {
      const repoKey = item.repository.full_name;
      if (!repos.has(repoKey)) {
        repos.set(repoKey, {
          id: item.repository.id,
          name: item.repository.name,
          full_name: item.repository.full_name,
          description: item.repository.description,
          stargazers_count: item.repository.stargazers_count,
          forks_count: item.repository.forks_count,
          language: item.repository.language,
          created_at: item.repository.created_at,
          updated_at: item.repository.updated_at,
          clone_url: item.repository.clone_url,
          default_branch: item.repository.default_branch,
        });
      }
    }

    return Array.from(repos.values());
  }

  /**
   * Search by popular NextJS-related keywords
   */
  async searchByPopularKeywords(limit: number): Promise<GitHubRepository[]> {
    const keywords = [
      "nextjs starter",
      "next.js template",
      "nextjs boilerplate",
      "next.js app",
    ];

    const results: GitHubRepository[] = [];

    for (const keyword of keywords) {
      if (results.length >= limit) break;

      const query = `${keyword} language:javascript stars:>100 created:>2020-01-01`;

      const response = await retry(async () => {
        return await this.octokit.rest.search.repos({
          q: query,
          sort: "stars",
          order: "desc",
          per_page: Math.min(100, limit - results.length),
        });
      });

      results.push(...response.data.items);
      await sleep(1000);
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

      if (response.data.type === "file") {
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
}
