import { writeFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default class DiagramService {
  constructor(outputDir = 'diagrams') {
    this.outputDir = join(dirname(dirname(__filename)), outputDir);
  }

  /**
   * Validates Mermaid diagram syntax
   * @param {string} mermaidCode - The Mermaid diagram code
   * @returns {boolean} True if syntax is valid
   */
  validateMermaidSyntax(mermaidCode) {
    // Basic validation - check for common Mermaid diagram types
    const validStarts = [
      'graph', 'flowchart', 'sequenceDiagram',
      'classDiagram', 'stateDiagram', 'erDiagram',
      'journey', 'gantt', 'pie'
    ];

    const firstWord = mermaidCode.trim().split(' ')[0].toLowerCase();
    return validStarts.some(start => firstWord.startsWith(start.toLowerCase()));
  }

  /**
   * Generates a unique filename for the diagram
   * @param {string} prefix - Optional prefix for the filename
   * @returns {string} Unique filename
   */
  generateDiagramFilename(prefix = 'diagram') {
    const timestamp = Date.now();
    const random = crypto.randomBytes(4).toString('hex');
    return `${prefix}-${timestamp}-${random}`;
  }

  /**
   * Generates Confluence-compatible HTML for embedding a Mermaid diagram
   * @param {string} mermaidCode - The Mermaid diagram code
   * @returns {string} HTML code for embedding in Confluence
   */
  generateConfluenceHtml(mermaidCode) {
    return `<div>
	<script type="module" src="https://cdn.jsdelivr.net/npm/mermaid@11.6.0/+esm"></script>
	<pre class="mermaid">
${mermaidCode}
	</pre>
</div>`;
  }

  /**
   * Saves a Mermaid diagram to a file and generates an image
   * @param {string} mermaidCode - The Mermaid diagram code
   * @param {string} [filename] - Optional filename (without extension), will generate if not provided
   * @returns {Promise<{pngPath: string, htmlMacro: string}>} Object containing PNG path and HTML macro
   */
  async saveDiagram(mermaidCode, filename) {
    if (!this.validateMermaidSyntax(mermaidCode)) {
      throw new Error('Invalid Mermaid diagram syntax');
    }

    // Ensure the output directory exists
    await mkdir(this.outputDir, { recursive: true });

    const baseFilename = filename?.replace(/\.[^/.]+$/, '') || this.generateDiagramFilename();
    const mmdFilePath = join(this.outputDir, `${baseFilename}.mmd`);
    const pngFilePath = join(this.outputDir, `${baseFilename}.png`);

    try {
      // Save the raw Mermaid code to the .mmd file
      await writeFile(mmdFilePath, mermaidCode, 'utf8');

      // Generate the image using global mmdc with absolute path to config
      const configPath = join(dirname(dirname(__filename)), 'puppeteerConfig.json');
      await execAsync(`mmdc -i "${mmdFilePath}" -o "${pngFilePath}" -b transparent -s 2 -p "${configPath}"`);

      // Save an HTML version for viewing in browser
      const htmlFilePath = join(this.outputDir, `${baseFilename}.html`);
      await writeFile(htmlFilePath, this.generateConfluenceHtml(mermaidCode), 'utf8');

      return {
        pngPath: pngFilePath,
        htmlMacro: this.generateConfluenceHtml(mermaidCode)
      };
    } catch (error) {
      console.error('Error generating diagram:', error);
      throw new Error(`Failed to generate diagram: ${error.message}`);
    }
  }
}