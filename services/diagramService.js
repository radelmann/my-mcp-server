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
   * Saves a Mermaid diagram to a file and generates an image
   * @param {string} mermaidCode - The Mermaid diagram code
   * @param {string} [filename] - Optional filename (without extension), will generate if not provided
   * @returns {Promise<string>} Path to the saved diagram image file
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
      // Save the Mermaid code to a file
      await writeFile(mmdFilePath, mermaidCode, 'utf8');

      // Generate the image using global mmdc
      await execAsync(`mmdc -i "${mmdFilePath}" -o "${pngFilePath}"`);

      return pngFilePath;
    } catch (error) {
      console.error('Error generating diagram:', error);
      throw new Error(`Failed to generate diagram: ${error.message}`);
    }
  }

  /**
   * Generates Confluence-compatible HTML for embedding a Mermaid diagram
   * @param {string} mermaidCode - The Mermaid diagram code
   * @returns {string} HTML code for embedding in Confluence
   */
  generateConfluenceHtml(mermaidCode) {
    return `<ac:structured-macro ac:name="html">
      <ac:plain-text-body><![CDATA[
        <div class="mermaid">
          ${mermaidCode}
        </div>
        <script src="https://cdn.jsdelivr.net/npm/mermaid/dist/mermaid.min.js"></script>
        <script>
          mermaid.initialize({ startOnLoad: true });
        </script>
      ]]></ac:plain-text-body>
    </ac:structured-macro>`;
  }
}