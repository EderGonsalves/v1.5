/**
 * Script de descoberta de schema do Baserow.
 *
 * Consulta a API do Baserow para listar todos os fields de cada tabela,
 * mapeando field_{ID} → nome legível + tipo.
 *
 * Uso:
 *   npx tsx scripts/discover-schema.ts
 *
 * Output: scripts/schema-map.json  (mapeamento completo)
 *         scripts/schema-map.ts    (schemas Drizzle gerados)
 */

import * as fs from "fs";
import * as path from "path";

const BASEROW_API_URL =
  process.env.BASEROW_API_URL ||
  process.env.AUTOMATION_DB_API_URL ||
  "https://automation-db.riasistemas.com.br/api";
const BASEROW_API_KEY =
  process.env.BASEROW_API_KEY ||
  process.env.AUTOMATION_DB_TOKEN ||
  "";

if (!BASEROW_API_KEY) {
  console.error("BASEROW_API_KEY ou AUTOMATION_DB_TOKEN não definido no .env");
  process.exit(1);
}

// Todas as tabelas usadas pelo sistema
const TABLES: Record<number, string> = {
  219: "automation",
  224: "config",
  225: "cases",
  226: "agentState",
  227: "caseMessages",
  228: "webhooks",
  229: "followUpConfig",
  230: "followUpHistory",
  231: "kanbanColumns",
  232: "caseKanbanStatus",
  233: "clients",
  234: "events",
  235: "eventGuests",
  236: "users",
  237: "roles",
  238: "menu",
  239: "permissions",
  240: "rolePermissions",
  241: "userRoles",
  242: "auditPermissions",
  243: "supportTickets",
  244: "supportMessages",
  245: "supportKb",
  246: "calendarSettings",
  247: "departments",
  248: "userDepartments",
  250: "userFeatures",
  251: "assignmentQueue",
  252: "lawsuitTracking",
  253: "lawsuitMovements",
  254: "pushSubscriptions",
  255: "pushNotifications",
  256: "signEnvelopes",
  257: "documentTemplates",
};

interface BaserowField {
  id: number;
  table_id: number;
  name: string;
  type: string;
  order: number;
  primary?: boolean;
  read_only?: boolean;
  link_row_table_id?: number;
  link_row_related_field_id?: number;
}

interface TableSchema {
  tableId: number;
  tableName: string;
  pgTableName: string;
  fields: Array<{
    fieldId: number;
    pgColumnName: string;
    name: string;
    type: string;
    primary: boolean;
    readOnly: boolean;
    linkRowTableId?: number;
  }>;
}

// Map Baserow field types to Drizzle/PG types
function mapBaserowType(
  brType: string,
): { drizzleType: string; pgType: string } {
  switch (brType) {
    case "text":
    case "long_text":
    case "url":
    case "email":
    case "phone_number":
      return { drizzleType: "text", pgType: "text" };
    case "number":
      return { drizzleType: "numeric", pgType: "numeric" };
    case "rating":
      return { drizzleType: "integer", pgType: "integer" };
    case "boolean":
      return { drizzleType: "boolean", pgType: "boolean" };
    case "date":
    case "created_on":
    case "last_modified":
      return { drizzleType: "timestamp", pgType: "timestamptz" };
    case "single_select":
      return { drizzleType: "integer", pgType: "integer" }; // FK to select option
    case "multiple_select":
      return { drizzleType: "jsonb", pgType: "jsonb" }; // Array of option IDs
    case "link_row":
      return { drizzleType: "jsonb", pgType: "jsonb" }; // M2M junction
    case "file":
      return { drizzleType: "jsonb", pgType: "jsonb" }; // File array
    case "single_select":
      return { drizzleType: "integer", pgType: "integer" };
    case "formula":
    case "lookup":
    case "count":
    case "rollup":
      return { drizzleType: "text", pgType: "text" }; // Computed fields
    case "uuid":
      return { drizzleType: "text", pgType: "uuid" };
    case "autonumber":
      return { drizzleType: "integer", pgType: "integer" };
    default:
      return { drizzleType: "text", pgType: "text" };
  }
}

// Convert name to valid TypeScript identifier (camelCase)
function toCamelCase(str: string): string {
  return str
    .replace(/[^a-zA-Z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .replace(/_([a-z])/g, (_, c) => c.toUpperCase())
    .replace(/^([A-Z])/, (c) => c.toLowerCase());
}

async function fetchTableFields(tableId: number): Promise<BaserowField[]> {
  const url = `${BASEROW_API_URL}/database/fields/table/${tableId}/`;
  const resp = await fetch(url, {
    headers: { Authorization: `Token ${BASEROW_API_KEY}` },
  });
  if (!resp.ok) {
    console.error(
      `  Erro ao buscar fields da tabela ${tableId}: ${resp.status} ${resp.statusText}`,
    );
    return [];
  }
  return resp.json();
}

function generateDrizzleSchema(schema: TableSchema): string {
  const imports = new Set<string>(["pgTable", "serial"]);
  const fieldLines: string[] = [];

  // Always include id
  fieldLines.push(`  id: serial("id").primaryKey(),`);

  for (const f of schema.fields) {
    const mapped = mapBaserowType(f.type);
    const tsName = toCamelCase(f.name);
    const colName = f.pgColumnName;

    // Skip computed/virtual fields that don't exist as real columns
    if (
      f.type === "formula" ||
      f.type === "lookup" ||
      f.type === "count" ||
      f.type === "rollup" ||
      f.type === "multiple_collaborators"
    ) {
      fieldLines.push(`  // ${tsName}: SKIP (${f.type}) — "${f.name}"`);
      continue;
    }

    // Skip link_row fields (handled via junction tables)
    if (f.type === "link_row") {
      fieldLines.push(
        `  // ${tsName}: SKIP (link_row → table ${f.linkRowTableId}) — "${f.name}"`,
      );
      continue;
    }

    switch (mapped.drizzleType) {
      case "text":
        imports.add("text");
        fieldLines.push(
          `  ${tsName}: text("${colName}"), // ${f.name} (${f.type})`,
        );
        break;
      case "integer":
        imports.add("integer");
        fieldLines.push(
          `  ${tsName}: integer("${colName}"), // ${f.name} (${f.type})`,
        );
        break;
      case "numeric":
        imports.add("numeric");
        fieldLines.push(
          `  ${tsName}: numeric("${colName}"), // ${f.name} (${f.type})`,
        );
        break;
      case "boolean":
        imports.add("boolean");
        fieldLines.push(
          `  ${tsName}: boolean("${colName}"), // ${f.name} (${f.type})`,
        );
        break;
      case "timestamp":
        imports.add("timestamp");
        fieldLines.push(
          `  ${tsName}: timestamp("${colName}", { withTimezone: true }), // ${f.name} (${f.type})`,
        );
        break;
      case "jsonb":
        imports.add("jsonb");
        fieldLines.push(
          `  ${tsName}: jsonb("${colName}"), // ${f.name} (${f.type})`,
        );
        break;
      default:
        imports.add("text");
        fieldLines.push(
          `  ${tsName}: text("${colName}"), // ${f.name} (${f.type})`,
        );
    }
  }

  const importList = Array.from(imports).sort().join(", ");
  return `import { ${importList} } from "drizzle-orm/pg-core";

/**
 * ${schema.tableName} — Baserow table ${schema.tableId}
 * PostgreSQL table: ${schema.pgTableName}
 */
export const ${schema.tableName} = pgTable("${schema.pgTableName}", {
${fieldLines.join("\n")}
});
`;
}

async function main() {
  console.log("=== Descoberta de Schema do Baserow ===\n");
  console.log(`API: ${BASEROW_API_URL}`);
  console.log(`Tabelas: ${Object.keys(TABLES).length}\n`);

  const allSchemas: TableSchema[] = [];

  for (const [idStr, name] of Object.entries(TABLES)) {
    const tableId = Number(idStr);
    process.stdout.write(`Tabela ${tableId} (${name})... `);

    const fields = await fetchTableFields(tableId);
    if (fields.length === 0) {
      console.log("SKIP (sem fields ou erro)");
      continue;
    }

    const schema: TableSchema = {
      tableId,
      tableName: name,
      pgTableName: `database_table_${tableId}`,
      fields: fields.map((f) => ({
        fieldId: f.id,
        pgColumnName: `field_${f.id}`,
        name: f.name,
        type: f.type,
        primary: !!f.primary,
        readOnly: !!f.read_only,
        linkRowTableId: f.link_row_table_id,
      })),
    };

    allSchemas.push(schema);
    console.log(`${fields.length} fields`);
  }

  // Write JSON map
  const jsonPath = path.join(__dirname, "schema-map.json");
  fs.writeFileSync(jsonPath, JSON.stringify(allSchemas, null, 2));
  console.log(`\nJSON salvo em: ${jsonPath}`);

  // Write Drizzle schemas
  const schemaDir = path.resolve(
    __dirname,
    "../src/lib/db/schema",
  );
  fs.mkdirSync(schemaDir, { recursive: true });

  const indexExports: string[] = [];

  for (const schema of allSchemas) {
    const content = generateDrizzleSchema(schema);
    const filePath = path.join(schemaDir, `${schema.tableName}.ts`);
    fs.writeFileSync(filePath, content);
    indexExports.push(
      `export { ${schema.tableName} } from "./${schema.tableName}";`,
    );
  }

  // Write index.ts barrel export
  const indexContent = `// Auto-generated by scripts/discover-schema.ts\n// Do not edit manually — re-run the script to update\n\n${indexExports.join("\n")}\n`;
  fs.writeFileSync(path.join(schemaDir, "index.ts"), indexContent);

  console.log(`Schemas Drizzle gerados em: ${schemaDir}/`);
  console.log(`Total: ${allSchemas.length} tabelas, ${allSchemas.reduce((s, t) => s + t.fields.length, 0)} fields`);
}

main().catch((err) => {
  console.error("Erro fatal:", err);
  process.exit(1);
});
