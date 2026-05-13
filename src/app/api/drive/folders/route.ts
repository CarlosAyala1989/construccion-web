import { NextResponse } from "next/server";

// GET /api/drive/folders?parentId=xxx&token=xxx
// Lists folders inside a given parent folder in Google Drive
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token");
  const parentId = searchParams.get("parentId") || "root";

  if (!token) {
    return NextResponse.json({ error: "Token requerido" }, { status: 401 });
  }

  try {
    // Query Google Drive API v3 for folders only
    const query = `'${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
    const fields = "files(id,name,mimeType,parents,createdTime)";
    const orderBy = "name";

    const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=${encodeURIComponent(fields)}&orderBy=${orderBy}&pageSize=100`;

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      const err = await res.json();
      return NextResponse.json(
        { error: err.error?.message || "Error al listar carpetas" },
        { status: res.status }
      );
    }

    const data = await res.json();
    return NextResponse.json({ folders: data.files || [] });
  } catch (error) {
    return NextResponse.json({ error: "Error de conexión con Google Drive" }, { status: 500 });
  }
}

// POST /api/drive/folders — Create a new folder
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { token, name, parentId } = body;

    if (!token || !name) {
      return NextResponse.json({ error: "Token y nombre requeridos" }, { status: 400 });
    }

    const metadata: any = {
      name,
      mimeType: "application/vnd.google-apps.folder",
    };

    if (parentId && parentId !== "root") {
      metadata.parents = [parentId];
    }

    const res = await fetch("https://www.googleapis.com/drive/v3/files", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(metadata),
    });

    if (!res.ok) {
      const err = await res.json();
      return NextResponse.json(
        { error: err.error?.message || "Error al crear carpeta" },
        { status: res.status }
      );
    }

    const folder = await res.json();
    return NextResponse.json({ folder }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: "Error al crear carpeta" }, { status: 500 });
  }
}
