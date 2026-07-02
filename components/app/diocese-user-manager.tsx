"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiRequest } from "@/lib/api-client";

type AssignableUserRole =
  | "DIOCESE_STAFF"
  | "DIOCESE_REPORT_VIEWER"
  | "PARISH_ADMIN";

type UserRole = string;

type ParishOption = { id: string; name: string };

type UserRecord = {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
  parishId: string | null;
  isActive: boolean;
  createdAt: string | Date;
  parish: { name: string } | null;
};

type UserForm = {
  email: string;
  displayName: string;
  role: AssignableUserRole;
  parishId: string;
  isActive: boolean;
};

const DEFAULT_FORM: UserForm = {
  email: "",
  displayName: "",
  role: "DIOCESE_STAFF",
  parishId: "",
  isActive: true,
};

const ROLE_LABELS: Record<string, string> = {
  GLOBAL_ADMIN: "Global Admin",
  DIOCESE_ADMIN: "Diocese Admin",
  DIOCESE_STAFF: "Diocese Staff",
  DIOCESE_REPORT_VIEWER: "Diocese Report Viewer",
  PARISH_ADMIN: "Parish Admin",
};

const ASSIGNABLE_ROLE_VALUES: AssignableUserRole[] = [
  "DIOCESE_STAFF",
  "DIOCESE_REPORT_VIEWER",
  "PARISH_ADMIN",
];

function formFromUser(user: UserRecord): UserForm {
  return {
    email: user.email,
    displayName: user.displayName,
    role: user.role as AssignableUserRole,
    parishId: user.parishId ?? "",
    isActive: user.isActive,
  };
}

export function DioceseUserManager({
  initialUsers,
  parishes,
}: {
  initialUsers: UserRecord[];
  parishes: ParishOption[];
}) {
  const [users, setUsers] = useState(initialUsers);
  const [createForm, setCreateForm] = useState<UserForm>(DEFAULT_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<UserForm | null>(null);
  const [saving, setSaving] = useState(false);

  function setCreateField(field: keyof UserForm, value: string | boolean) {
    setCreateForm((current) => ({ ...current, [field]: value } as UserForm));
  }

  function setEditField(field: keyof UserForm, value: string | boolean) {
    setEditForm((current) => (current ? ({ ...current, [field]: value } as UserForm) : current));
  }

  function normalizeParishId(role: AssignableUserRole, parishId: string) {
    return role === "PARISH_ADMIN" ? parishId || null : null;
  }

  function isAssignableRole(role: string): role is AssignableUserRole {
    return ASSIGNABLE_ROLE_VALUES.includes(role as AssignableUserRole);
  }

  async function createUser() {
    setSaving(true);
    try {
      const response = await apiRequest<{ ok: true; user: UserRecord }>(
        "/api/dioceses/users",
        {
          method: "POST",
          body: JSON.stringify({
            email: createForm.email,
            displayName: createForm.displayName,
            role: createForm.role,
            parishId: normalizeParishId(createForm.role, createForm.parishId),
            isActive: createForm.isActive,
          }),
        },
      );

      const parish = parishes.find((item) => item.id === response.user.parishId) ?? null;
      const user = {
        ...response.user,
        parish: parish ? { name: parish.name } : null,
      };

      setUsers((current) => upsertUser(current, user));
      setCreateForm(DEFAULT_FORM);
      toast.success("User assignment saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to save user");
    } finally {
      setSaving(false);
    }
  }

  async function updateUser(id: string) {
    if (!editForm) return;
    setSaving(true);
    try {
      const response = await apiRequest<{ ok: true; user: UserRecord }>(
        `/api/dioceses/users/${id}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            displayName: editForm.displayName,
            role: editForm.role,
            parishId: normalizeParishId(editForm.role, editForm.parishId),
            isActive: editForm.isActive,
          }),
        },
      );

      const parish = parishes.find((item) => item.id === response.user.parishId) ?? null;
      const user = {
        ...response.user,
        email: users.find((entry) => entry.id === id)?.email ?? editForm.email,
        createdAt:
          users.find((entry) => entry.id === id)?.createdAt ?? new Date().toISOString(),
        parish: parish ? { name: parish.name } : null,
      };

      setUsers((current) => upsertUser(current, user));
      setEditingId(null);
      setEditForm(null);
      toast.success("User assignment updated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to update user");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Assign Diocese and Parish Roles</CardTitle>
          <CardDescription>
            Diocese Admins assign Diocese Staff, Diocese Report Viewer, and Parish Admin roles. Every assignment is audited.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <Field label="Email">
            <Input
              type="email"
              value={createForm.email}
              onChange={(event) => setCreateField("email", event.target.value)}
            />
          </Field>
          <Field label="Display name">
            <Input
              value={createForm.displayName}
              onChange={(event) => setCreateField("displayName", event.target.value)}
            />
          </Field>
          <Field label="Role">
            <NativeSelect
              value={createForm.role}
              onChange={(event) =>
                setCreateField("role", event.target.value as AssignableUserRole)
              }
            >
              {ASSIGNABLE_ROLE_VALUES.map((value) => (
                <NativeSelectOption key={value} value={value}>
                  {ROLE_LABELS[value]}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Parish scope">
            <NativeSelect
              value={createForm.parishId}
              disabled={createForm.role !== "PARISH_ADMIN"}
              onChange={(event) => setCreateField("parishId", event.target.value)}
            >
              <NativeSelectOption value="">Diocese-wide</NativeSelectOption>
              {parishes.map((parish) => (
                <NativeSelectOption key={parish.id} value={parish.id}>
                  {parish.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
          <div className="flex items-end justify-end xl:col-span-1">
            <Button
              type="button"
              disabled={
                saving ||
                !createForm.email.trim() ||
                !createForm.displayName.trim() ||
                (createForm.role === "PARISH_ADMIN" && !createForm.parishId)
              }
              onClick={createUser}
            >
              {saving ? "Saving…" : "Assign role"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Current Assignments</CardTitle>
          <CardDescription>
            Diocese-level users remain summary-only unless a separate sharing grant exists.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Scope</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => {
                const isEditing = editingId === user.id && editForm;
                return (
                  <TableRow key={user.id}>
                    <TableCell>
                      <div className="space-y-1">
                        <div className="font-medium">{user.displayName}</div>
                        <div className="text-[0.6875rem] text-muted-foreground">{user.email}</div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {isEditing ? (
                        <NativeSelect
                          value={editForm.role}
                          onChange={(event) =>
                            setEditField(
                              "role",
                              event.target.value as AssignableUserRole,
                            )
                          }
                        >
                          {ASSIGNABLE_ROLE_VALUES.map((value) => (
                            <NativeSelectOption key={value} value={value}>
                              {ROLE_LABELS[value]}
                            </NativeSelectOption>
                          ))}
                        </NativeSelect>
                      ) : (
                        ROLE_LABELS[user.role] ?? user.role
                      )}
                    </TableCell>
                    <TableCell>
                      {isEditing ? (
                        <NativeSelect
                          value={editForm.parishId}
                          disabled={editForm.role !== "PARISH_ADMIN"}
                          onChange={(event) => setEditField("parishId", event.target.value)}
                        >
                          <NativeSelectOption value="">Diocese-wide</NativeSelectOption>
                          {parishes.map((parish) => (
                            <NativeSelectOption key={parish.id} value={parish.id}>
                              {parish.name}
                            </NativeSelectOption>
                          ))}
                        </NativeSelect>
                      ) : user.parish?.name ? (
                        user.parish.name
                      ) : (
                        "Diocese-wide"
                      )}
                    </TableCell>
                    <TableCell>
                      {isEditing ? (
                        <NativeSelect
                          value={editForm.isActive ? "active" : "inactive"}
                          onChange={(event) =>
                            setEditField("isActive", event.target.value === "active")
                          }
                        >
                          <NativeSelectOption value="active">Active</NativeSelectOption>
                          <NativeSelectOption value="inactive">Inactive</NativeSelectOption>
                        </NativeSelect>
                      ) : (
                        <Badge variant={user.isActive ? "secondary" : "outline"}>
                          {user.isActive ? "Active" : "Inactive"}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {new Date(user.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      {isEditing ? (
                        <div className="flex justify-end gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => {
                              setEditingId(null);
                              setEditForm(null);
                            }}
                          >
                            Cancel
                          </Button>
                          <Button type="button" disabled={saving} onClick={() => updateUser(user.id)}>
                            Save
                          </Button>
                        </div>
                      ) : isAssignableRole(user.role) ? (
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => {
                            setEditingId(user.id);
                            setEditForm(formFromUser(user));
                          }}
                        >
                          Edit
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          Fixed role
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function upsertUser(users: UserRecord[], user: UserRecord) {
  const next = users.some((entry) => entry.id === user.id)
    ? users.map((entry) => (entry.id === user.id ? user : entry))
    : [...users, user];

  return next.sort((left, right) => left.displayName.localeCompare(right.displayName));
}