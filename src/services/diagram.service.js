const PythonAgentService = require('./pythonAgent.service');

class DiagramService {
  
  // Prompts for different diagram types
  static getPrompts() {
    return {
      flowchart: (repoName) => `Generate a Mermaid flowchart showing the code architecture and module structure of the "${repoName}" repository. 
Include main directories, key files, their relationships, and data flow. 
Return ONLY valid Mermaid flowchart syntax. Start with \`\`\`mermaid or just the diagram code.
Example format:
flowchart TD
    A[Main Entry] --> B[Module 1]
    B --> C[Module 2]
    C --> D[Database]`,

      class: (repoName) => `Generate a Mermaid class diagram showing the main classes/interfaces and their relationships in the "${repoName}" repository. 
Include inheritance (--|>), composition (*--), and key methods.
Return ONLY valid Mermaid class diagram syntax.
Example format:
classDiagram
    class User {
        +String id
        +String email
        +login()
    }
    class Repository {
        +String name
        +index()
    }
    User --> Repository`,

      sequence: (repoName) => `Generate a Mermaid sequence diagram showing the main API flow or user interaction flow in the "${repoName}" repository. 
Show how different components communicate with each other.
Return ONLY valid Mermaid sequence diagram syntax.
Example format:
sequenceDiagram
    participant User
    participant Frontend
    participant Backend
    User->>Frontend: Click button
    Frontend->>Backend: API call
    Backend-->>Frontend: Response`,

      component: (repoName) => `Generate a Mermaid component diagram showing the high-level architecture of the "${repoName}" repository. 
Show major components, their boundaries, and dependencies.
Return ONLY valid Mermaid component diagram syntax.
Example format:
graph LR
    subgraph Frontend
        A[UI Components]
    end
    subgraph Backend
        B[API Server]
        C[Database]
    end
    A --> B
    B --> C`,

      architecture: (repoName) => `Generate a comprehensive Mermaid architecture diagram for the "${repoName}" repository. 
Include all major components, their relationships, data flow, and external integrations.
Return ONLY valid Mermaid diagram syntax.`
    };
  }

  static async generateDiagram(repoName, diagramType, branchFilter = null) {
    const prompts = this.getPrompts();
    const prompt = prompts[diagramType]?.(repoName) || prompts.flowchart(repoName);
    
    console.log(`📐 Generating ${diagramType} diagram for ${repoName}...`);
    
    const response = await PythonAgentService.queryRepo(
      repoName,
      prompt,
      null,
      branchFilter
    );
    
    // Extract and clean mermaid code
    let diagramCode = response.answer;
    diagramCode = diagramCode.replace(/```mermaid\n?/g, '');
    diagramCode = diagramCode.replace(/```\n?/g, '');
    diagramCode = diagramCode.replace(/^mermaid\n?/i, '');
    diagramCode = diagramCode.trim();
    
    return {
      diagramCode,
      sources: response.sources,
      model: response.model
    };
  }
}

module.exports = DiagramService;