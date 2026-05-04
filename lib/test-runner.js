const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

class TestRunner {
  constructor() {
    this.frameworkDetectors = {
      'gtest': { files: ['CMakeLists.txt'], patterns: [/gtest/i, /googletest/i] },
      'catch2': { files: ['CMakeLists.txt'], patterns: [/catch2/i, /Catch2/] },
      'jest': { files: ['package.json', 'jest.config.js'], patterns: [/"jest":/] },
      'vitest': { files: ['package.json', 'vitest.config.ts'], patterns: [/"vitest":/] },
      'pytest': { files: ['pytest.ini', 'setup.py', 'pyproject.toml'], patterns: [/pytest/] },
      'unittest': { files: ['test_*.py', '*_test.py'], patterns: [/import unittest/] },
      'mocha': { files: ['package.json', '.mocharc.json'], patterns: [/"mocha":/] }
    };

    this.testFilePatterns = {
      'c': ['*_test.c', 'test_*.c', '*_test.cpp', 'test_*.cpp'],
      'cpp': ['*_test.cpp', 'test_*.cpp', '*_test.cc', 'test_*.cc'],
      'typescript': ['*.test.ts', '*.spec.ts', '*.test.tsx', '*.spec.tsx'],
      'javascript': ['*.test.js', '*.spec.js'],
      'python': ['test_*.py', '*_test.py']
    };
  }

  discover(repos, languages) {
    const results = { frameworks: {}, testFiles: {} };

    for (const repo of repos) {
      if (!fs.existsSync(repo)) continue;

      const repoFrameworks = new Set();
      const repoTestFiles = [];

      for (const lang of languages) {
        const frameworks = this._detectFrameworks(repo, lang);
        frameworks.forEach(f => repoFrameworks.add(f));

        const testFiles = this._findTestFiles(repo, lang);
        repoTestFiles.push(...testFiles);
      }

      results.frameworks[repo] = Array.from(repoFrameworks);
      results.testFiles[repo] = repoTestFiles;
    }

    return results;
  }

  run(testFile, testName, framework, timeout = 30000) {
    const startTime = Date.now();
    const command = this._buildCommand(testFile, testName, framework);

    try {
      const stdout = execSync(command, {
        timeout,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe']
      });
      const duration = Date.now() - startTime;
      return { status: 'passed', stdout, stderr: '', duration, testFile, testName, framework };
    } catch (error) {
      const duration = Date.now() - startTime;
      return {
        status: 'failed',
        stdout: error.stdout || '',
        stderr: error.stderr || '',
        duration,
        testFile,
        testName,
        framework
      };
    }
  }

  parseResult(stdout, stderr, framework) {
    const parser = this[`_parse${framework.charAt(0).toUpperCase() + framework.slice(1)}`];
    if (!parser) {
      return { passed: 0, failed: 0, skipped: 0, failures: [] };
    }
    return parser.call(this, stdout, stderr);
  }

  _detectFrameworks(repo, language) {
    const frameworks = [];
    const langFrameworks = {
      'c': ['gtest', 'catch2'],
      'cpp': ['gtest', 'catch2'],
      'typescript': ['jest', 'vitest'],
      'javascript': ['jest', 'mocha'],
      'python': ['pytest', 'unittest']
    };

    for (const fw of langFrameworks[language] || []) {
      const detector = this.frameworkDetectors[fw];
      for (const file of detector.files) {
        const filePath = path.join(repo, file);
        if (fs.existsSync(filePath)) {
          const content = fs.readFileSync(filePath, 'utf8');
          if (detector.patterns.some(p => p.test(content))) {
            frameworks.push(fw);
            break;
          }
        }
      }
    }

    return frameworks;
  }

  _findTestFiles(repo, language) {
    const patterns = this.testFilePatterns[language] || [];
    const testFiles = [];

    const walk = (dir) => {
      if (!fs.existsSync(dir)) return;
      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory() && !entry.name.startsWith('.')) {
          walk(fullPath);
        } else if (entry.isFile()) {
          if (patterns.some(p => this._matchPattern(entry.name, p))) {
            testFiles.push(fullPath);
          }
        }
      }
    };

    walk(repo);
    return testFiles;
  }

  _matchPattern(filename, pattern) {
    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
    return regex.test(filename);
  }

  _buildCommand(testFile, testName, framework) {
    const commands = {
      'gtest': testName ? `./${testFile} --gtest_filter=${testName}` : `./${testFile}`,
      'catch2': testName ? `./${testFile} ${testName}` : `./${testFile}`,
      'jest': testName ? `npx jest ${testFile} -t "${testName}"` : `npx jest ${testFile}`,
      'vitest': testName ? `npx vitest run ${testFile} -t "${testName}"` : `npx vitest run ${testFile}`,
      'pytest': testName ? `pytest ${testFile}::${testName}` : `pytest ${testFile}`,
      'unittest': `python -m unittest ${testFile}`,
      'mocha': testName ? `npx mocha ${testFile} --grep "${testName}"` : `npx mocha ${testFile}`
    };
    return commands[framework] || `echo "Unknown framework: ${framework}"`;
  }

  _parseGtest(stdout, stderr) {
    const result = { passed: 0, failed: 0, skipped: 0, failures: [] };
    const passMatch = stdout.match(/\[  PASSED  \] (\d+) test/);
    const failMatch = stdout.match(/\[  FAILED  \] (\d+) test/);
    if (passMatch) result.passed = parseInt(passMatch[1]);
    if (failMatch) result.failed = parseInt(failMatch[1]);

    const failureRegex = /\[ RUN      \] (.+)\n([\s\S]*?)\[  FAILED  \]/g;
    let match;
    while ((match = failureRegex.exec(stdout)) !== null) {
      result.failures.push({ testName: match[1], reason: match[2].trim() });
    }
    return result;
  }

  _parseCatch2(stdout, stderr) {
    const result = { passed: 0, failed: 0, skipped: 0, failures: [] };
    const passMatch = stdout.match(/test cases:\s+(\d+)\s+\|\s+(\d+) passed/);
    if (passMatch) {
      result.passed = parseInt(passMatch[2]);
      result.failed = parseInt(passMatch[1]) - parseInt(passMatch[2]);
    }
    return result;
  }

  _parseJest(stdout, stderr) {
    const result = { passed: 0, failed: 0, skipped: 0, failures: [] };
    const testMatch = stdout.match(/Tests:\s+(?:(\d+) failed,\s*)?(?:(\d+) passed)?/);
    if (testMatch) {
      result.failed = parseInt(testMatch[1] || 0);
      result.passed = parseInt(testMatch[2] || 0);
    }
    return result;
  }

  _parseVitest(stdout, stderr) {
    return this._parseJest(stdout, stderr);
  }

  _parsePytest(stdout, stderr) {
    const result = { passed: 0, failed: 0, skipped: 0, failures: [] };
    const summaryMatch = stdout.match(/(\d+) passed|(\d+) failed|(\d+) skipped/g);
    if (summaryMatch) {
      summaryMatch.forEach(m => {
        const [count, type] = m.split(' ');
        if (type === 'passed') result.passed = parseInt(count);
        if (type === 'failed') result.failed = parseInt(count);
        if (type === 'skipped') result.skipped = parseInt(count);
      });
    }

    const failureRegex = /_+ (.+?) _+\n([\s\S]*?)(?=_+ |$)/g;
    let match;
    while ((match = failureRegex.exec(stdout)) !== null) {
      result.failures.push({ testName: match[1], reason: match[2].trim() });
    }
    return result;
  }

  _parseUnittest(stdout, stderr) {
    const result = { passed: 0, failed: 0, skipped: 0, failures: [] };
    const okMatch = stderr.match(/Ran (\d+) test.*\n\nOK/);
    const failMatch = stderr.match(/FAILED \(failures=(\d+)\)/);
    if (okMatch) result.passed = parseInt(okMatch[1]);
    if (failMatch) result.failed = parseInt(failMatch[1]);
    return result;
  }

  _parseMocha(stdout, stderr) {
    const result = { passed: 0, failed: 0, skipped: 0, failures: [] };
    const summaryMatch = stdout.match(/(\d+) passing|(\d+) failing/g);
    if (summaryMatch) {
      summaryMatch.forEach(m => {
        const [count, type] = m.split(' ');
        if (type === 'passing') result.passed = parseInt(count);
        if (type === 'failing') result.failed = parseInt(count);
      });
    }
    return result;
  }
}

module.exports = { TestRunner };
