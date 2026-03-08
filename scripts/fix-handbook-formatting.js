#!/usr/bin/env node
/**
 * Fix ** markers in handbook markdown files
 *
 * This script removes literal ** markdown markers that appear in:
 * - Section titles
 * - HTML heading tags
 * - Content that should be bold but displays as **text**
 */

const fs = require('fs');
const path = require('path');

const HANDBOOK_PATH = path.join(__dirname, '../docs/tenant-ui-handbook.md');
const OUTPUT_PATH = path.join(__dirname, '../docs/tenant-ui-handbook-formatted.md');

console.log('Reading handbook from:', HANDBOOK_PATH);
let content = fs.readFileSync(HANDBOOK_PATH, 'utf-8');

console.log('Original file size:', content.length, 'characters');

// Track changes
let changes = 0;

// Fix 1: Remove ** from markdown headings (## **Title** → ## Title)
const headingPattern = /^(#{1,6})\s+\*\*(.+?)\*\*\s*$/gm;
content = content.replace(headingPattern, (match, hashes, title) => {
  changes++;
  return `${hashes} ${title}`;
});
console.log(`Fixed ${changes} markdown headings with ** markers`);

// Fix 2: Remove ** from HTML heading tags (<h3>**Text**</h3> → <h3>Text</h3>)
const htmlHeadingPattern = /<(h[1-6][^>]*)>\s*\*\*(.+?)\*\*\s*<\/h[1-6]>/gi;
const beforeHtmlFix = changes;
content = content.replace(htmlHeadingPattern, (match, tag, text) => {
  changes++;
  return `<${tag}>${text}</h${tag.charAt(1)}>`;
});
console.log(`Fixed ${changes - beforeHtmlFix} HTML headings with ** markers`);

// Fix 3: Remove ** from list items that start with ** (<li>**Text** - rest</li>)
const listItemPattern = /<li[^>]*>\s*\*\*(.+?)\*\*(.+?)<\/li>/gi;
const beforeListFix = changes;
content = content.replace(listItemPattern, (match, boldText, rest) => {
  changes++;
  // Keep the bold formatting but use <strong> instead of **
  return `<li><strong>${boldText}</strong>${rest}</li>`;
});
console.log(`Fixed ${changes - beforeListFix} list items with ** markers`);

// Fix 4: In dangerouslySetInnerHTML content, replace ** with proper <strong> tags
// This is trickier because we need to preserve the HTML structure
const innerHtmlPattern = /dangerouslySetInnerHTML=\{\{\s*__html:\s*`([^`]+)`\s*\}\}/g;
const beforeInnerHtmlFix = changes;
content = content.replace(innerHtmlPattern, (match, htmlContent) => {
  // Within the HTML content, replace **text** with <strong>text</strong>
  // But only if it's not already inside a tag
  let modified = htmlContent.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

  if (modified !== htmlContent) {
    changes++;
  }

  return `dangerouslySetInnerHTML={{ __html: \`${modified}\` }}`;
});
console.log(`Fixed ${changes - beforeInnerHtmlFix} dangerouslySetInnerHTML blocks with ** markers`);

// Fix 5: In plain markdown content (not in code blocks), replace ** with actual bold
// Split by code blocks first to avoid modifying code
let inCodeBlock = false;
const lines = content.split('\n');
const fixedLines = lines.map(line => {
  // Track code block boundaries
  if (line.trim().startsWith('```')) {
    inCodeBlock = !inCodeBlock;
    return line;
  }

  // Don't modify lines in code blocks
  if (inCodeBlock) {
    return line;
  }

  // Don't modify lines that are already HTML or JSX
  if (line.includes('className=') || line.includes('dangerouslySetInnerHTML')) {
    return line;
  }

  // Replace **text** with just text in plain markdown
  // This should catch remaining ** markers in regular text
  const originalLine = line;
  const modifiedLine = line.replace(/\*\*([^*]+)\*\*/g, '$1');

  if (modifiedLine !== originalLine && !line.startsWith('#')) {
    // Only count changes in non-heading lines (headings already counted)
    changes++;
  }

  return modifiedLine;
});

content = fixedLines.join('\n');

console.log('\n========================================');
console.log('SUMMARY');
console.log('========================================');
console.log(`Total changes made: ${changes}`);
console.log(`Output file: ${OUTPUT_PATH}`);
console.log(`New file size: ${content.length} characters`);

// Write output
fs.writeFileSync(OUTPUT_PATH, content, 'utf-8');
console.log('\n✅ Formatting fixes complete!');
console.log('\nNext steps:');
console.log('1. Review the output file for correctness');
console.log('2. Manually filter technical content');
console.log('3. Restructure into module-based categories');
