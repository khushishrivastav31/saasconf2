#!/usr/bin/env node
/**
 * Reorganize handbook into 14 module-based categories
 *
 * This script takes the filtered handbook and reorganizes sections
 * into a module-based hierarchy matching the application structure.
 */

const fs = require('fs');
const path = require('path');

const INPUT_PATH = path.join(__dirname, '../docs/tenant-ui-handbook-clean.md');
const OUTPUT_PATH = path.join(__dirname, '../docs/tenant-ui-handbook-restructured.md');

console.log('Reading filtered handbook from:', INPUT_PATH);
const content = fs.readFileSync(INPUT_PATH, 'utf-8');

// Define the 14 categories with their target sections
const categories = [
  {
    id: 'getting-started',
    name: '1. Getting Started',
    description: 'Introduction to SaaSConf and basic navigation',
    sections: ['Introduction to SaaSConf', 'User Roles', 'Navigation', 'Dashboard']
  },
  {
    id: 'conferences',
    name: '2. Conferences',
    description: 'Conference creation and management',
    sections: ['Conference Dashboard', 'Creating a Conference', 'Conference Details', 'Team Management', 'Social Media']
  },
  {
    id: 'cfp-module',
    name: '3. Call for Papers (CFP Module)',
    description: 'Complete CFP workflow from setup to decisions',
    moduleCode: 'cfp',
    sections: ['CFP', 'Topics', 'Committee', 'Applicants', 'Papers', 'Review', 'Decisions', 'CFP Portal']
  },
  {
    id: 'program-sessions',
    name: '4. Program & Sessions',
    description: 'Program design and session management',
    sections: ['Program', 'Sessions', 'Speakers']
  },
  {
    id: 'volunteers-module',
    name: '5. Volunteers Module',
    description: 'Volunteer task management and scheduling',
    moduleCode: 'volunteers',
    sections: ['Volunteers', 'Task Assignment', 'Volunteer Assignment', 'Volunteer Schedule']
  },
  {
    id: 'attendees-registration',
    name: '6. Attendees & Registration',
    description: 'Registration and attendee management',
    sections: ['Registration', 'Attendees', 'Attendee Replacement', 'Session Selection']
  },
  {
    id: 'financial-management',
    name: '7. Financial Management',
    description: 'Booking, invoicing, and payment processing',
    sections: ['Booking Options', 'Packages', 'Discount Codes', 'Invoice', 'Payment', 'Stripe', 'Invoice Settings', 'Number Formats']
  },
  {
    id: 'event-operations',
    name: '8. Event Operations',
    description: 'Locations, sponsors, and service providers',
    sections: ['Locations', 'Venues', 'Sponsors', 'Contracts', 'Service Providers']
  },
  {
    id: 'communication',
    name: '9. Communication',
    description: 'News, messaging, email, and screen overlays',
    sections: ['News', 'Announcements', 'Messaging', 'Email Templates', 'Screen Overlays']
  },
  {
    id: 'alumni-management',
    name: '10. Alumni Management',
    description: 'Alumni import and management',
    sections: ['Alumni']
  },
  {
    id: 'deadlines-reminders',
    name: '11. Deadlines & Reminders',
    description: 'Deadline configuration and notifications',
    sections: ['Deadlines', 'Reminders']
  },
  {
    id: 'settings-configuration',
    name: '12. Settings & Configuration',
    description: 'Conference and system settings',
    sections: ['Settings', 'General Settings', 'Fiscal Representative', 'Registration Settings']
  },
  {
    id: 'best-practices',
    name: '13. Best Practices',
    description: 'Timeline, templates, and common pitfalls',
    sections: ['Best Practices', 'Conference Planning', 'Pitfalls', 'Templates']
  },
  {
    id: 'troubleshooting-faq',
    name: '14. Troubleshooting & FAQ',
    description: 'Quick reference, common issues, and glossary',
    sections: ['Troubleshooting', 'FAQ', 'Quick Reference', 'Glossary']
  }
];

// Parse sections from markdown
const sections = parseMarkdownSections(content);
console.log(`Found ${sections.length} sections in handbook`);

// Map sections to categories
const categorizedContent = {};
for (const category of categories) {
  categorizedContent[category.id] = {
    ...category,
    content: []
  };
}

// Organize sections into categories
for (const section of sections) {
  let assigned = false;

  for (const category of categories) {
    for (const keyword of category.sections) {
      if (section.title.toLowerCase().includes(keyword.toLowerCase())) {
        categorizedContent[category.id].content.push(section);
        assigned = true;
        break;
      }
    }
    if (assigned) break;
  }

  if (!assigned) {
    console.warn(`Warning: Section "${section.title}" not assigned to any category`);
  }
}

// Generate restructured markdown
let output = `# SaaSConf Tenant UI Handbook

*User Guide for Conference Management*

**Last Updated**: ${new Date().toISOString().split('T')[0]}
**Version**: 3.0 - Restructured & User-Focused

---

## About This Handbook

This handbook provides comprehensive guidance for using the SaaSConf platform to manage conferences. All technical and developer content has been removed - this guide focuses on **what features do**, **how to use them**, and **how they work together**.

### Organization

The handbook is organized into 14 categories matching the module structure of SaaSConf:

`;

// Add table of contents
for (const category of categories) {
  const sectionCount = categorizedContent[category.id].content.length;
  output += `- **${category.name}** - ${category.description} (${sectionCount} sections)\n`;
}

output += '\n---\n\n';

// Add each category's content
for (const category of categories) {
  const categoryData = categorizedContent[category.id];

  output += `# ${category.name}\n\n`;
  output += `${category.description}\n\n`;

  if (category.moduleCode) {
    output += `**Module Code**: \`${category.moduleCode}\`\n\n`;
  }

  if (categoryData.content.length === 0) {
    output += `*No sections currently available for this category.*\n\n`;
  } else {
    for (const section of categoryData.content) {
      output += `## ${section.number ? section.number + ' ' : ''}${section.title}\n\n`;
      output += section.content;
      output += '\n\n---\n\n';
    }
  }
}

// Write output
fs.writeFileSync(OUTPUT_PATH, output, 'utf-8');

console.log('\n========================================');
console.log('REORGANIZATION COMPLETE');
console.log('========================================');
console.log(`Output: ${OUTPUT_PATH}`);
console.log(`Categories: ${categories.length}`);
console.log(`Total sections: ${sections.length}`);
console.log('\nSections per category:');
for (const category of categories) {
  const count = categorizedContent[category.id].content.length;
  console.log(`  ${category.name}: ${count} sections`);
}

// Helper function to parse markdown sections
function parseMarkdownSections(markdown) {
  const sections = [];
  const lines = markdown.split('\n');

  let currentSection = null;
  let currentContent = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Match ## headings (section level)
    const match = line.match(/^##\s+(\d+\.?\d*\.?\s+)?(.+)$/);

    if (match) {
      // Save previous section
      if (currentSection) {
        currentSection.content = currentContent.join('\n').trim();
        sections.push(currentSection);
      }

      // Start new section
      currentSection = {
        number: match[1] ? match[1].trim() : null,
        title: match[2].trim(),
        content: []
      };
      currentContent = [];
    } else if (currentSection) {
      currentContent.push(line);
    }
  }

  // Save last section
  if (currentSection) {
    currentSection.content = currentContent.join('\n').trim();
    sections.push(currentSection);
  }

  return sections;
}
