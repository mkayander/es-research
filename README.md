# ES-Research: NextJS Projects JavaScript Syntax Analysis

A comprehensive research tool for analyzing the prevalence of invalid JavaScript syntax in NextJS projects using the [es-guard](https://github.com/mkayander/es-guard) tool.

## 🎯 Research Objective

This project aims to determine the global prevalence of invalid JavaScript syntax and features in NextJS projects by:

1. **Sampling**: Collecting a statistically significant sample of popular NextJS projects
2. **Analysis**: Using es-guard to detect invalid syntax and features
3. **Reporting**: Providing comprehensive statistical analysis and insights

## 📊 Research Methodology

### Statistical Approach

- **Sample Size**: 1000 projects (configurable)
- **Confidence Level**: 95%
- **Margin of Error**: 5%
- **Selection Criteria**: Projects with 100+ stars and 10+ forks

### Analysis Process

1. **Multi-strategy GitHub Search**: Uses multiple search strategies to find NextJS projects
2. **File Discovery**: Recursively discovers JavaScript/TypeScript files
3. **Syntax Analysis**: Runs es-guard on each file to detect issues
4. **Statistical Analysis**: Calculates confidence intervals and prevalence rates

## 🚀 Quick Start

### Prerequisites

- Bun (JavaScript runtime)
- GitHub API token

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd es-research

# Install dependencies
bun install

# Set up GitHub token
export GITHUB_TOKEN="your-github-token-here"
```

### Run Complete Research

```bash
# Run the full research pipeline
bun run research

# Or run with custom sample size
bun run research -s 500
```

### Step-by-Step Execution

```bash
# 1. Fetch projects from GitHub
bun run fetch

# 2. Analyze projects with es-guard
bun run analyze

# 3. Generate reports
bun run report
```

## 📁 Project Structure

```
es-research/
├── src/
│   ├── config.ts              # Configuration and research parameters
│   ├── github-client.ts       # GitHub API client with rate limiting
│   ├── es-guard-analyzer.ts   # es-guard integration and analysis
│   ├── fetch-projects.ts      # Project discovery and collection
│   ├── analyze-projects.ts    # Main analysis pipeline
│   ├── generate-report.ts     # Report generation
│   ├── utils.ts               # Utility functions
│   └── index.ts               # CLI entry point
├── dist/                      # Compiled JavaScript output
├── data/                      # Raw data and analysis results
├── reports/                   # Generated reports
├── cache/                     # Temporary cache files
├── tsconfig.json              # TypeScript configuration
├── bunfig.toml                # Bun configuration
└── package.json
```

## ⚙️ Configuration

### Environment Variables

- `GITHUB_TOKEN`: GitHub API token (required)

### Research Parameters

```javascript
{
  sampleSize: 1000,           // Number of projects to analyze
  confidenceLevel: 0.95,      // Statistical confidence level
  marginOfError: 0.05,        // Margin of error
  searchCriteria: {
    minStars: 100,            // Minimum stars for projects
    minForks: 10,             // Minimum forks for projects
    createdAfter: '2020-01-01' // Focus on modern projects
  }
}
```

### Analysis Parameters

```javascript
{
  maxFilesPerProject: 100,    // Maximum files to analyze per project
  maxFileSize: 1024 * 1024,   // Maximum file size (1MB)
  analysisTimeout: 30000,     // Timeout for es-guard analysis
  concurrency: 5              // Concurrent analysis jobs
}
```

## 📊 Output Reports

### Generated Files

- `project-summary.csv`: Overview of all analyzed projects
- `issues-detail.csv`: Detailed breakdown of all issues found
- `statistics-summary.csv`: Statistical summary and metrics
- `detailed-results.json`: Complete analysis results
- `summary-report.json`: High-level summary with confidence intervals
- `research-report.md`: Comprehensive markdown report
- `summary.yaml`: YAML format summary

### Key Metrics

- **Issue Prevalence**: Percentage of projects with invalid syntax
- **Confidence Intervals**: Statistical confidence in the results
- **Issue Categories**: Breakdown by type of syntax issue
- **Severity Distribution**: Distribution by error/warning/info levels

## 🔧 CLI Commands

```bash
# Show help
bun run src/index.ts --help

# Validate configuration
bun run src/index.ts validate

# Show current configuration
bun run src/index.ts config

# Fetch projects with custom parameters
bun run src/index.ts fetch -s 500 --min-stars 200

# Analyze with custom settings
bun run src/index.ts analyze --max-files 50 --concurrency 10

# Run complete pipeline with custom parameters
bun run src/index.ts research -s 200 --min-stars 500 --max-files 75
```

## 📈 Statistical Significance

The research follows best practices for statistical sampling:

- **Sample Size Calculation**: Based on confidence level and margin of error
- **Random Sampling**: Multiple search strategies to avoid bias
- **Confidence Intervals**: 95% confidence intervals for all prevalence estimates
- **Error Handling**: Comprehensive error tracking and reporting

## 🛠️ Development

### Adding New Analysis Features

1. **Extend ESGuardAnalyzer**: Add new analysis methods in `src/es-guard-analyzer.ts`
2. **Update Configuration**: Add new parameters in `src/config.ts`
3. **Enhance Reporting**: Add new report formats in `src/generate-report.ts`

### Customizing Search Strategies

The GitHub client uses multiple search strategies:

- Framework-based search
- Package.json content search
- Keyword-based search

Add new strategies in `src/github-client.ts`.

### TypeScript Development

This project is built with TypeScript and Bun for better type safety and performance:

- **TypeScript**: Full type safety with strict configuration
- **Bun**: Fast JavaScript runtime with built-in bundler
- **ES Modules**: Modern module system with `.js` extensions for imports
- **Development**: Use `bun run dev` for watch mode development

## 📋 Research Ethics

- **Rate Limiting**: Respects GitHub API rate limits
- **Data Privacy**: Only analyzes publicly available code
- **Transparency**: All methodology and results are documented
- **Reproducibility**: Complete configuration and data available

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📄 License

This project is licensed under the ISC License.

## 🙏 Acknowledgments

- [es-guard](https://github.com/mkayander/es-guard) for JavaScript syntax analysis
- GitHub API for project discovery
- The NextJS community for the projects analyzed

---

_This research tool is designed to provide insights into JavaScript compatibility issues in the NextJS ecosystem. The results help developers and tool maintainers understand the scope of syntax compatibility challenges._
