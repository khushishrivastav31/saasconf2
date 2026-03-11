#!/usr/bin/env node
/**
 * Generate handbookSections.tsx from tenant-ui-handbook.md
 *
 * Parses the markdown handbook and creates TypeScript with category structure.
 *
 * Heading mapping:
 *   ## N. Category Name  → category (group in sidebar)
 *   ### N.N Section Name → section (card in content area)
 *   #### and below       → content within section (converted to HTML headings)
 */

const fs = require('fs');
const path = require('path');

const INPUT_PATH = path.join(__dirname, '../docs/tenant-ui-handbook.md');
const OUTPUT_PATH = path.join(__dirname, '../frontend/src/pages/Handbook/handbookSections.tsx');

console.log('Reading handbook...');
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

  // First, collect Introduction + Appendix as special categories
  // Then collect ## N. groups as categories and ### N.N as sections

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Match ## N. Category Name (e.g., "## 1. Event Setup")
    const catMatch = line.match(/^##\s+(\d+)\.\s+(.+)$/);
    if (catMatch) {
      // Save previous section
      if (currentSection) {
        currentSection.content = processContent(currentContent.join('\n'));
        sections.push(currentSection);
        currentSection = null;
      }

      const categoryNum = catMatch[1];
      const categoryName = catMatch[2];

      currentCategory = {
        id: `category-${categoryNum}`,
        name: categoryName,
        number: categoryNum,
        description: '',
        moduleCode: null,
        sectionIds: [],
      };
      categories.push(currentCategory);
      currentContent = [];
      inContent = false;
      continue;
    }

    // Match ## Introduction or ## Appendix (unnumbered categories)
    const specialCatMatch = line.match(/^##\s+(Introduction|Appendix)$/);
    if (specialCatMatch) {
      // Save previous section
      if (currentSection) {
        currentSection.content = processContent(currentContent.join('\n'));
        sections.push(currentSection);
        currentSection = null;
      }

      const name = specialCatMatch[1];
      const catId = name === 'Introduction' ? 'category-intro' : 'category-appendix';

      currentCategory = {
        id: catId,
        name: name,
        number: name === 'Introduction' ? '0' : '99',
        description: '',
        moduleCode: null,
        sectionIds: [],
      };
      categories.push(currentCategory);

      // For Introduction, treat all content until next ## as a single section
      const secId = slugify(name);
      currentSection = {
        id: secId,
        title: name,
        categoryId: catId,
        content: '',
      };
      currentCategory.sectionIds.push(secId);
      currentContent = [];
      inContent = true;
      continue;
    }

    // Match ### N.N Section Name (e.g., "### 1.1 Details")
    const secMatch = line.match(/^###\s+(\d+\.\d+)\s+(.+)$/);
    if (secMatch && currentCategory) {
      // Save previous section
      if (currentSection) {
        currentSection.content = processContent(currentContent.join('\n'));
        sections.push(currentSection);
      }

      const secTitle = secMatch[2].trim();
      const secId = slugify(secMatch[1] + '-' + secTitle);

      currentSection = {
        id: secId,
        title: secTitle,
        categoryId: currentCategory.id,
        content: '',
      };

      currentCategory.sectionIds.push(secId);
      currentContent = [];
      inContent = true;
      continue;
    }

    // Match ### Glossary, ### Getting Help (appendix sections)
    const appendixSecMatch = line.match(/^###\s+(Glossary|Getting Help|FAQ)$/);
    if (appendixSecMatch && currentCategory && currentCategory.id === 'category-appendix') {
      if (currentSection) {
        currentSection.content = processContent(currentContent.join('\n'));
        sections.push(currentSection);
      }

      const secTitle = appendixSecMatch[1];
      const secId = slugify(secTitle);

      currentSection = {
        id: secId,
        title: secTitle,
        categoryId: currentCategory.id,
        content: '',
      };

      currentCategory.sectionIds.push(secId);
      currentContent = [];
      inContent = true;
      continue;
    }

    // Collect content lines
    if (inContent && currentSection) {
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
  let html = content.trim();

  // Remove excessive newlines
  html = html.replace(/\n{3,}/g, '\n\n');

  // Convert <cfp-flow> to styled flow diagram
  html = html.replace(
    /<cfp-flow>\s*([\s\S]*?)\s*<\/cfp-flow>/g,
    (_, content) => {
      const steps = content.split('→').map((s) => s.trim()).filter(Boolean);
      let flowHtml = '<div class="my-6 overflow-x-auto"><div style="display:flex;align-items:center;gap:0;min-width:max-content;padding:8px 0">';
      steps.forEach((step, i) => {
        flowHtml += `<div style="display:flex;flex-direction:column;align-items:center;padding:12px 20px;border-radius:8px;font-weight:600;font-size:13px;white-space:nowrap;` +
          `background:${i === 0 ? '#dbeafe' : i === steps.length - 1 ? '#d1fae5' : '#f3f4f6'};` +
          `color:${i === 0 ? '#1e40af' : i === steps.length - 1 ? '#065f46' : '#374151'};` +
          `border:1px solid ${i === 0 ? '#93c5fd' : i === steps.length - 1 ? '#6ee7b7' : '#d1d5db'}">${step}</div>`;
        if (i < steps.length - 1) {
          flowHtml += '<div style="display:flex;align-items:center;padding:0 4px"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg></div>';
        }
      });
      flowHtml += '</div></div>';
      return flowHtml;
    }
  );

  // Convert <status-flow> to branching status diagram
  html = html.replace(
    /<status-flow>\s*([\s\S]*?)\s*<\/status-flow>/g,
    (_, content) => {
      const colorMap = {
        blue: { bg: '#dbeafe', border: '#93c5fd', text: '#1e40af' },
        amber: { bg: '#fef3c7', border: '#fcd34d', text: '#92400e' },
        purple: { bg: '#ede9fe', border: '#c4b5fd', text: '#5b21b6' },
        green: { bg: '#d1fae5', border: '#6ee7b7', text: '#065f46' },
        red: { bg: '#fee2e2', border: '#fca5a5', text: '#991b1b' },
        gray: { bg: '#f3f4f6', border: '#d1d5db', text: '#374151' },
      };

      const parseStep = (s) => {
        const parts = s.trim().split('|');
        const label = parts[0].trim();
        const color = colorMap[parts[1]?.trim()] || colorMap.gray;
        return { label, color };
      };

      const arrow = '<div style="display:flex;align-items:center;padding:0 4px"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg></div>';

      const stepBox = (s) => {
        const { label, color } = parseStep(s);
        return `<div style="display:flex;align-items:center;padding:8px 16px;border-radius:8px;font-weight:600;font-size:13px;white-space:nowrap;background:${color.bg};color:${color.text};border:1px solid ${color.border}">${label}</div>`;
      };

      const rows = content.trim().split('\n').filter(Boolean);
      let flowHtml = '<div class="my-6 space-y-3">';

      rows.forEach((row, ri) => {
        const steps = row.split('→');
        flowHtml += `<div style="display:flex;align-items:center;gap:0;min-width:max-content;padding:4px 0${ri > 0 ? ';margin-left:0' : ''}">`;
        steps.forEach((step, si) => {
          flowHtml += stepBox(step);
          if (si < steps.length - 1) flowHtml += arrow;
        });
        flowHtml += '</div>';
      });

      flowHtml += '</div>';
      return flowHtml;
    }
  );

  // Convert ##### headings to h5
  html = html.replace(
    /^#####\s+(.+)$/gm,
    '<h5 class="font-medium text-gray-800 dark:text-gray-200 mt-4 mb-2 text-sm">$1</h5>'
  );

  // Convert #### headings to h4
  html = html.replace(
    /^####\s+(.+)$/gm,
    '<h4 class="font-medium text-gray-900 dark:text-gray-100 mt-5 mb-2">$1</h4>'
  );

  // Convert ### headings to h3 (sub-sub-sections within a section)
  html = html.replace(
    /^###\s+(.+)$/gm,
    '<h3 class="font-semibold text-gray-900 dark:text-gray-100 mt-6 mb-3">$1</h3>'
  );

  // Convert markdown tables to HTML tables
  html = convertTables(html);

  // Convert lists (before bold/italic to avoid conflicts)
  html = convertLists(html);

  // Convert **bold** to <strong>
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

  // Convert *italic* to <em> (but not inside HTML tags)
  html = html.replace(/(?<![<\w])(\*([^*]+)\*)(?![>\w])/g, '<em>$2</em>');

  // Convert `code` to <code>
  html = html.replace(
    /`([^`]+)`/g,
    '<code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">$1</code>'
  );

  // Convert paragraphs
  const lines = html.split('\n');
  const processed = [];

  for (let line of lines) {
    line = line.trim();
    if (!line) continue;

    if (line.startsWith('<')) {
      processed.push(line);
    } else {
      processed.push(`<p class="text-gray-700 dark:text-gray-300 my-2">${line}</p>`);
    }
  }

  return processed.join('\n');
}

function convertTables(html) {
  const lines = html.split('\n');
  const result = [];
  let inTable = false;
  let tableRows = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Detect table row (starts and ends with |)
    if (line.startsWith('|') && line.endsWith('|')) {
      if (!inTable) {
        inTable = true;
        tableRows = [];
      }
      // Skip separator rows (|---|---|---| etc.)
      if (line.replace(/\s/g, '').match(/^\|[-:|]+\|$/)) continue;
      tableRows.push(line);
    } else {
      if (inTable) {
        // End of table — convert collected rows
        result.push(renderTable(tableRows));
        inTable = false;
        tableRows = [];
      }
      result.push(lines[i]);
    }
  }

  if (inTable) {
    result.push(renderTable(tableRows));
  }

  return result.join('\n');
}

function renderTable(rows) {
  if (rows.length === 0) return '';

  const parseRow = (row) =>
    row
      .split('|')
      .slice(1, -1)
      .map((cell) => cell.trim());

  const headers = parseRow(rows[0]);
  const dataRows = rows.slice(1).map(parseRow);

  let html =
    '<div class="overflow-x-auto my-4"><table class="min-w-full text-sm border border-gray-200 dark:border-gray-700 rounded-lg">';
  html += '<thead><tr class="bg-gray-50 dark:bg-gray-800">';
  for (const h of headers) {
    html += `<th class="px-3 py-2 text-left font-medium text-gray-700 dark:text-gray-300 border-b border-gray-200 dark:border-gray-700">${h}</th>`;
  }
  html += '</tr></thead><tbody>';

  for (const row of dataRows) {
    html += '<tr class="border-b border-gray-100 dark:border-gray-700">';
    for (const cell of row) {
      html += `<td class="px-3 py-2 text-gray-700 dark:text-gray-300">${cell}</td>`;
    }
    html += '</tr>';
  }

  html += '</tbody></table></div>';
  return html;
}

function convertLists(html) {
  const lines = html.split('\n');
  const result = [];
  let listType = null; // 'ul' or 'ol'

  for (const line of lines) {
    if (line.match(/^-\s+(.+)/)) {
      if (listType !== 'ul') {
        if (listType) result.push(`</${listType}>`);
        result.push('<ul class="list-disc list-inside space-y-1.5 my-3 ml-2">');
        listType = 'ul';
      }
      const content = line.replace(/^-\s+/, '');
      result.push(`<li class="text-gray-700 dark:text-gray-300">${content}</li>`);
    } else if (line.match(/^\d+\.\s+(.+)/)) {
      if (listType !== 'ol') {
        if (listType) result.push(`</${listType}>`);
        result.push('<ol class="list-decimal list-inside space-y-1.5 my-3 ml-2">');
        listType = 'ol';
      }
      const content = line.replace(/^\d+\.\s+/, '');
      result.push(`<li class="text-gray-700 dark:text-gray-300">${content}</li>`);
    } else {
      if (listType) {
        result.push(`</${listType}>`);
        listType = null;
      }
      result.push(line);
    }
  }

  if (listType) {
    result.push(`</${listType}>`);
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
  return str.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$/g, '\\$');
}

function generateTypeScript(categories, sections) {
  const sectionMap = {};
  sections.forEach((s) => {
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
    code += `    name: '${escapeForTemplate(cat.name)}',\n`;
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
