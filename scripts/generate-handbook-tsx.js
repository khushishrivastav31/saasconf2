#!/usr/bin/env node
/**
 * Generate handbookSections.tsx from restructured markdown
 *
 * Creates TypeScript with category structure and nested sections
 */

const fs = require('fs');
const path = require('path');

const INPUT_PATH = path.join(__dirname, '../docs/tenant-ui-handbook-restructured.md');
const OUTPUT_PATH = path.join(__dirname, '../frontend/src/pages/Handbook/handbookSections.tsx');

console.log('Reading restructured handbook...');
const content = fs.readFileSync(INPUT_PATH, 'utf-8');

// Parse categories and sections from markdown
const { categories, sections } = parseHandbook(content);

console.log(`Found ${categories.length} categories with ${sections.length} total sections`);

// Generate TypeScript code
const tsCode = generateTypeScript(categories, sections);

// Write output
fs.writeFileSync(OUTPUT_PATH, tsCode, 'utf-8');

console.log('\n✅ Generated handbookSections.tsx');
console.log(`Output: ${OUTPUT_PATH}`);
console.log(`Size: ${tsCode.length} characters`);

function parseHandbook(md) {
  const lines = md.split('\n');
  const categories = [];
  const sections = [];

  let currentCategory = null;
  let currentSection = null;
  let currentContent = [];
  let inContent = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Match # Category (level 1 heading with number)
    const catMatch = line.match(/^#\s+(\d+)\.\s+(.+)$/);
    if (catMatch) {
      // Save previous section if exists
      if (currentSection) {
        currentSection.content = processContent(currentContent.join('\n'));
        sections.push(currentSection);
        currentSection = null;
      }

      // Extract category info from following lines
      const categoryNum = catMatch[1];
      const categoryName = catMatch[2];

      // Look ahead for description and moduleCode
      let description = '';
      let moduleCode = null;

      if (lines[i + 2] && !lines[i + 2].startsWith('#')) {
        description = lines[i + 2].trim();
      }

      if (lines[i + 4] && lines[i + 4].includes('**Module Code**')) {
        const modMatch = lines[i + 4].match(/`([^`]+)`/);
        if (modMatch) moduleCode = modMatch[1];
      }

      currentCategory = {
        id: `category-${categoryNum}`,
        name: categoryName,
        number: categoryNum,
        description,
        moduleCode,
        sectionIds: []
      };
      categories.push(currentCategory);
      currentContent = [];
      inContent = false;
      continue;
    }

    // Match ## Section (level 2 heading)
    const secMatch = line.match(/^##\s+(\d+\.?\d*\.?\s+)?(.+)$/);
    if (secMatch && currentCategory) {
      // Save previous section
      if (currentSection) {
        currentSection.content = processContent(currentContent.join('\n'));
        sections.push(currentSection);
      }

      // Start new section
      const secNumber = secMatch[1] ? secMatch[1].trim() : null;
      const secTitle = secMatch[2].trim();
      const secId = slugify(secTitle);

      currentSection = {
        id: secId,
        title: secTitle,
        number: secNumber,
        categoryId: currentCategory.id,
        content: ''
      };

      currentCategory.sectionIds.push(secId);
      currentContent = [];
      inContent = true;
      continue;
    }

    // Collect content
    if (inContent && currentSection) {
      // Skip separator lines
      if (line.trim() === '---') continue;
      currentContent.push(line);
    }
  }

  // Save last section
  if (currentSection) {
    currentSection.content = processContent(currentContent.join('\n'));
    sections.push(currentSection);
  }

  return { categories, sections };
}

function processContent(content) {
  // Convert markdown to simple HTML
  let html = content.trim();

  // Remove excessive newlines
  html = html.replace(/\n{3,}/g, '\n\n');

  // Convert ### headings to h3
  html = html.replace(/^###\s+(.+)$/gm, '<h3 class="font-semibold text-gray-900 dark:text-gray-100 mt-6 mb-3">$1</h3>');

  // Convert #### headings to h4
  html = html.replace(/^####\s+(.+)$/gm, '<h4 class="font-medium text-gray-900 dark:text-gray-100 mt-4 mb-2">$1</h4>');

  // Convert **[Screenshot: X]** to styled div
  html = html.replace(/\*\*\[Screenshot:\s*([^\]]+)\]\*\*/g,
    '<div class="my-4 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg"><p class="text-sm text-blue-700 dark:text-blue-300 italic">📸 Screenshot: $1</p></div>');

  // Convert lists
  html = convertLists(html);

  // Convert **bold** to <strong>
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

  // Convert *italic* to <em>
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');

  // Convert `code` to <code>
  html = html.replace(/`([^`]+)`/g, '<code class="bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded text-sm">$1</code>');

  // Convert paragraphs
  const lines = html.split('\n');
  const processed = [];
  let inList = false;

  for (let line of lines) {
    line = line.trim();
    if (!line) continue;

    if (line.startsWith('<')) {
      // HTML already
      processed.push(line);
    } else if (line.match(/^-\s+/)) {
      // List item
      inList = true;
      processed.push(line);
    } else {
      // Regular paragraph
      if (inList) {
        inList = false;
      }
      if (!line.startsWith('<h')) {
        processed.push(`<p class="text-gray-700 dark:text-gray-300 my-2">${line}</p>`);
      } else {
        processed.push(line);
      }
    }
  }

  return processed.join('\n');
}

function convertLists(html) {
  const lines = html.split('\n');
  const result = [];
  let inList = false;

  for (let line of lines) {
    if (line.match(/^-\s+(.+)/)) {
      if (!inList) {
        result.push('<ul class="list-disc list-inside space-y-2 my-4">');
        inList = true;
      }
      const content = line.replace(/^-\s+/, '');
      result.push(`<li class="text-gray-700 dark:text-gray-300">${content}</li>`);
    } else {
      if (inList) {
        result.push('</ul>');
        inList = false;
      }
      result.push(line);
    }
  }

  if (inList) {
    result.push('</ul>');
  }

  return result.join('\n');
}

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function escapeForTemplate(str) {
  // Escape for template literal - only backticks and backslashes need escaping
  // $ doesn't need escaping since we're not using interpolation inside the HTML content
  return str.replace(/\\/g, '\\\\').replace(/`/g, '\\`');
}

function generateTypeScript(categories, sections) {
  const sectionMap = {};
  sections.forEach(s => {
    sectionMap[s.id] = s;
  });

  let code = `import type { ReactNode } from 'react';

export interface HandbookSection {
  id: string;
  title: string;
  content: () => ReactNode;
  categoryId: string;
}

export interface HandbookCategory {
  id: string;
  name: string;
  description: string;
  moduleCode?: string;
  sections: HandbookSection[];
}

export const handbookCategories: HandbookCategory[] = [
`;

  for (let i = 0; i < categories.length; i++) {
    const cat = categories[i];

    code += `  {\n`;
    code += `    id: '${cat.id}',\n`;
    code += `    name: '${cat.name}',\n`;
    code += `    description: '${escapeForTemplate(cat.description)}',\n`;
    if (cat.moduleCode) {
      code += `    moduleCode: '${cat.moduleCode}',\n`;
    }
    code += `    sections: [\n`;

    for (const sectionId of cat.sectionIds) {
      const section = sectionMap[sectionId];
      if (!section) continue;

      const contentEscaped = escapeForTemplate(section.content);

      code += `      {\n`;
      code += `        id: '${section.id}',\n`;
      code += `        title: '${escapeForTemplate(section.title)}',\n`;
      code += `        categoryId: '${cat.id}',\n`;
      code += `        content: () => (\n`;
      code += `          <div dangerouslySetInnerHTML={{ __html: \`${contentEscaped}\` }} />\n`;
      code += `        ),\n`;
      code += `      },\n`;
    }

    code += `    ],\n`;
    code += `  }${i < categories.length - 1 ? ',' : ''}\n`;
  }

  code += `];\n\n`;
  code += `// Flatten for backward compatibility\n`;
  code += `export const handbookSections: HandbookSection[] = handbookCategories.flatMap(cat => cat.sections);\n`;

  return code;
}
