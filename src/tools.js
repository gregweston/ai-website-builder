export const tools = [
  {
    name: 'update_page',
    description:
      "Replace the student's project with this complete, updated HTML document. Always call this tool whenever you add, change, or remove anything in the project. Provide the ENTIRE document as one self-contained HTML document (including <style> and <script> tags inline) — not just the changed part, and not a diff or markdown code block.",
    input_schema: {
      type: 'object',
      properties: {
        html: {
          type: 'string',
          description: 'The complete HTML document for the project, starting with <!DOCTYPE html>.'
        }
      },
      required: ['html']
    }
  },
  {
    name: 'search_images',
    description:
      "Search a curated, kid-safe stock photo library for a real photo the student wants to add to their project (e.g. they ask for 'a picture of a golden retriever' or 'add a photo of the ocean'). Use a short, simple search phrase (2-4 words) describing the subject. Do NOT invent or guess an image URL yourself and do NOT call update_page with a made-up image link — always search first and let the student pick from real results before you place an image.",
    input_schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'A short search phrase, e.g. "golden retriever puppy" or "sunset beach".'
        }
      },
      required: ['query']
    }
  }
];
