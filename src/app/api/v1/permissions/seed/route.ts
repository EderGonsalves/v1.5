import { NextRequest, NextResponse } from "next/server";
import axios from "axios";

import { getRequestAuth, resolveLegacyIdentifier } from "@/lib/auth/session";

const BASEROW_API_URL =
  process.env.BASEROW_API_URL ?? process.env.NEXT_PUBLIC_BASEROW_API_URL;
const BASEROW_API_KEY =
  process.env.BASEROW_API_KEY ?? process.env.NEXT_PUBLIC_BASEROW_API_KEY;

const TABLE_IDS = {
  users: Number(process.env.BASEROW_USERS_TABLE_ID ?? process.env.NEXT_PUBLIC_BASEROW_USERS_TABLE_ID ?? 236),
  roles: Number(process.env.BASEROW_ROLES_TABLE_ID ?? process.env.NEXT_PUBLIC_BASEROW_ROLES_TABLE_ID ?? 237),
  menus: Number(process.env.BASEROW_MENU_TABLE_ID ?? process.env.NEXT_PUBLIC_BASEROW_MENU_TABLE_ID ?? 238),
  permissions: Number(process.env.BASEROW_PERMISSIONS_TABLE_ID ?? process.env.NEXT_PUBLIC_BASEROW_PERMISSIONS_TABLE_ID ?? 239),
  rolePermissions: Number(process.env.BASEROW_ROLE_PERMISSION_TABLE_ID ?? process.env.NEXT_PUBLIC_BASEROW_ROLE_PERMISSION_TABLE_ID ?? 240),
  userRoles: Number(process.env.BASEROW_USER_ROLE_TABLE_ID ?? process.env.NEXT_PUBLIC_BASEROW_USER_ROLE_TABLE_ID ?? 241),
};

const client = () =>
  axios.create({
    baseURL: BASEROW_API_URL,
    headers: {
      Authorization: `Token ${BASEROW_API_KEY}`,
      "Content-Type": "application/json",
    },
    timeout: 15000,
  });

const listRows = async (tableId: number) => {
  const res = await client().get(
    `/database/rows/table/${tableId}/?user_field_names=true&size=200`,
  );
  return res.data.results ?? [];
};

const listFields = async (tableId: number) => {
  const res = await client().get(`/database/fields/table/${tableId}/`);
  return res.data as Array<{ id: number; name: string; type: string; link_row_table_id?: number }>;
};

const createRow = async (tableId: number, payload: Record<string, unknown>) => {
  const res = await client().post(
    `/database/rows/table/${tableId}/?user_field_names=true`,
    payload,
  );
  return res.data;
};

export async function POST(request: NextRequest) {
  try {
    const auth = getRequestAuth(request);
    if (!auth) {
      return NextResponse.json({ error: "NÃ£o autenticado" }, { status: 401 });
    }

    const legacyUserId = resolveLegacyIdentifier(auth);
    if (!legacyUserId) {
      return NextResponse.json(
        { error: "legacyUserId ausente" },
        { status: 401 },
      );
    }

    const log: string[] = [];

    // 1) DiagnÃ³stico: listar fields de cada tabela
    const [fieldsRoles, fieldsMenus, fieldsPerms, fieldsRP, fieldsUR] =
      await Promise.all([
        listFields(TABLE_IDS.roles),
        listFields(TABLE_IDS.menus),
        listFields(TABLE_IDS.permissions),
        listFields(TABLE_IDS.rolePermissions),
        listFields(TABLE_IDS.userRoles),
      ]);

    log.push(`== Fields tabela roles (${TABLE_IDS.roles}) ==`);
    fieldsRoles.forEach((f) => log.push(`  ${f.name} (${f.type})${f.link_row_table_id ? ` -> table ${f.link_row_table_id}` : ""}`));

    log.push(`== Fields tabela menus (${TABLE_IDS.menus}) ==`);
    fieldsMenus.forEach((f) => log.push(`  ${f.name} (${f.type})${f.link_row_table_id ? ` -> table ${f.link_row_table_id}` : ""}`));

    log.push(`== Fields tabela permissions (${TABLE_IDS.permissions}) ==`);
    fieldsPerms.forEach((f) => log.push(`  ${f.name} (${f.type})${f.link_row_table_id ? ` -> table ${f.link_row_table_id}` : ""}`));

    log.push(`== Fields tabela rolePermissions (${TABLE_IDS.rolePermissions}) ==`);
    fieldsRP.forEach((f) => log.push(`  ${f.name} (${f.type})${f.link_row_table_id ? ` -> table ${f.link_row_table_id}` : ""}`));

    log.push(`== Fields tabela userRoles (${TABLE_IDS.userRoles}) ==`);
    fieldsUR.forEach((f) => log.push(`  ${f.name} (${f.type})${f.link_row_table_id ? ` -> table ${f.link_row_table_id}` : ""}`));

    // 2) Verificar rows existentes
    const [existingRoles, existingMenus, existingPerms, existingUR] =
      await Promise.all([
        listRows(TABLE_IDS.roles),
        listRows(TABLE_IDS.menus),
        listRows(TABLE_IDS.permissions),
        listRows(TABLE_IDS.userRoles),
      ]);

    log.push(`\n== Rows existentes ==`);
    log.push(`roles: ${existingRoles.length}`);
    log.push(`menus: ${existingMenus.length}`);
    log.push(`permissions: ${existingPerms.length}`);
    log.push(`userRoles: ${existingUR.length}`);
    if (existingUR.length > 0) {
      log.push(`userRoles data: ${JSON.stringify(existingUR)}`);
    }

    // 3) Seed roles (se vazio)
    let sysAdminRole: { id: number } | null = null;
    let userRole: { id: number } | null = null;

    if (existingRoles.length === 0) {
      log.push("\n>> Criando roles...");
      const createdSysAdminRole = await createRow(TABLE_IDS.roles, {
        name: "SysAdmin",
        description: "Administrador do sistema com acesso total",
        is_system: true,
      });
      sysAdminRole = createdSysAdminRole;
      log.push(`  SysAdmin criado: id=${createdSysAdminRole.id}`);

      const createdUserRole = await createRow(TABLE_IDS.roles, {
        name: "User",
        description: "UsuÇ­rio padrÇœo com acesso bÇ­sico",
        is_system: true,
      });
      userRole = createdUserRole;
      log.push(`  User criado: id=${createdUserRole.id}`);
    } else {
      log.push("\n>> Roles jÃ¡ existem, pulando criaÃ§Ã£o");
      sysAdminRole = existingRoles.find(
        (r: Record<string, unknown>) =>
          String(r.name ?? "").toLowerCase() === "sysadmin",
      ) ?? null;
      if (sysAdminRole) {
        log.push(`  SysAdmin encontrado: id=${sysAdminRole.id}`);
      } else {
        log.push("  WARN: nenhuma role 'SysAdmin' encontrada nas existentes");
      }
    }

    // 4) Seed menus (se vazio)
    const createdMenus: Array<{ id: number; label: string }> = [];
    if (existingMenus.length === 0 && sysAdminRole) {
      log.push("\n>> Criando menus padrÃ£o...");
      const menuDefs = [
        { label: "Agenda", path: "/agenda", display_order: 1, is_active: true },
        { label: "ConfiguraÃ§Ãµes", path: "/configuracoes", display_order: 2, is_active: true },
      ];
      for (const def of menuDefs) {
        const menu = await createRow(TABLE_IDS.menus, def);
        createdMenus.push({ id: menu.id, label: def.label });
        log.push(`  Menu "${def.label}" criado: id=${menu.id}`);
      }
    } else {
      log.push(`\n>> Menus jÃ¡ existem (${existingMenus.length}), pulando`);
    }

    // 5) Seed permissions (se vazio)
    const createdPerms: Array<{ id: number; code: string }> = [];
    if (existingPerms.length === 0 && createdMenus.length > 0) {
      log.push("\n>> Criando permissÃµes padrÃ£o...");
      const permDefs = [
        { code: "agenda.view", description: "Visualizar agenda", menuLabel: "Agenda" },
        { code: "agenda.manage", description: "Gerenciar agenda", menuLabel: "Agenda" },
        { code: "config.view", description: "Visualizar configuraÃ§Ãµes", menuLabel: "ConfiguraÃ§Ãµes" },
        { code: "config.manage", description: "Gerenciar configuraÃ§Ãµes", menuLabel: "ConfiguraÃ§Ãµes" },
      ];
      for (const def of permDefs) {
        const menu = createdMenus.find((m) => m.label === def.menuLabel);
        const payload: Record<string, unknown> = {
          code: def.code,
          description: def.description,
        };
        if (menu) {
          payload.menu_id = [menu.id];
        }
        const perm = await createRow(TABLE_IDS.permissions, payload);
        createdPerms.push({ id: perm.id, code: def.code });
        log.push(`  PermissÃ£o "${def.code}" criada: id=${perm.id}`);
      }
    } else {
      log.push(`\n>> PermissÃµes jÃ¡ existem (${existingPerms.length}), pulando`);
    }

    // 6) Vincular SysAdmin a todas as permissÃµes (rolePermissions)
    if (sysAdminRole && createdPerms.length > 0) {
      log.push("\n>> Vinculando permissÃµes ao SysAdmin...");
      for (const perm of createdPerms) {
        await createRow(TABLE_IDS.rolePermissions, {
          role_id: [sysAdminRole.id],
          permission_id: [perm.id],
        });
        log.push(`  SysAdmin -> ${perm.code}`);
      }
    }

    // 7) Vincular user atual ao role SysAdmin (userRoles)
    if (sysAdminRole) {
      // Buscar user id do usuÃ¡rio logado
      const usersRes = await client().get(
        `/database/rows/table/${TABLE_IDS.users}/?user_field_names=true&size=1&filter__legacy_user_id__equal=${encodeURIComponent(legacyUserId)}`,
      );
      const currentUser = (usersRes.data.results ?? [])[0];

      if (currentUser) {
        // Verificar se jÃ¡ existe vÃ­nculo
        const existingLink = existingUR.find((ur: Record<string, unknown>) => {
          const users = Array.isArray(ur.user_id)
            ? ur.user_id.map((u: Record<string, unknown>) => (typeof u === "number" ? u : u?.id))
            : [];
          const roles = Array.isArray(ur.role_id)
            ? ur.role_id.map((r: Record<string, unknown>) => (typeof r === "number" ? r : r?.id))
            : [];
          return users.includes(currentUser.id) && roles.includes(sysAdminRole!.id);
        });

        if (!existingLink) {
          log.push(`\n>> Vinculando user ${currentUser.id} (${legacyUserId}) ao SysAdmin...`);
          await createRow(TABLE_IDS.userRoles, {
            user_id: [currentUser.id],
            role_id: [sysAdminRole.id],
          });
          log.push("  VÃ­nculo criado!");
        } else {
          log.push(`\n>> User ${currentUser.id} jÃ¡ vinculado ao SysAdmin`);
        }
      } else {
        log.push(`\n>> WARN: user com legacy_user_id=${legacyUserId} nÃ£o encontrado na tabela users`);
      }
    }

    console.log("[permissions/seed] resultado:\n" + log.join("\n"));

    return NextResponse.json({ success: true, log }, { status: 200 });
  } catch (error) {
    console.error("[permissions/seed] error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Erro no seed",
        details: error instanceof Error ? error.stack : undefined,
      },
      { status: 500 },
    );
  }
}
