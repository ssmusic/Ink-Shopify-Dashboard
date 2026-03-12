import { useState, useEffect } from "react";
import { useFetcher } from "react-router";
import { Users, Plus, Pencil, Trash2, X, Eye, EyeOff, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";

interface WarehouseUser {
  id: string;
  name: string;
  email: string;
  role: string;
  createdAt: string | null;
}

type FormMode = "create" | "edit" | null;

export default function UserManagementSettings() {
  // Use two separate fetchers: one for reading (GET), one for mutations (POST)
  const listFetcher = useFetcher<{ users: WarehouseUser[] }>();
  const mutateFetcher = useFetcher<{ success?: boolean; error?: string; userId?: string }>();

  const [formMode, setFormMode] = useState<FormMode>(null);
  const [editingUser, setEditingUser] = useState<WarehouseUser | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [formError, setFormError] = useState("");

  // Load users on mount using useFetcher.load (carries Shopify session context)
  useEffect(() => {
    listFetcher.load("/app/api/users");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // After a successful mutation, reload list and close form
  useEffect(() => {
    if (mutateFetcher.state === "idle" && mutateFetcher.data) {
      const data = mutateFetcher.data;
      if (data.success) {
        setFormMode(null);
        setEditingUser(null);
        setName(""); setEmail(""); setPassword(""); setFormError("");
        setDeleteConfirmId(null);
        // Reload the list
        listFetcher.load("/app/api/users");
      } else if (data.error) {
        setFormError(data.error);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mutateFetcher.state, mutateFetcher.data]);

  const openCreate = () => {
    setFormMode("create");
    setEditingUser(null);
    setName(""); setEmail(""); setPassword(""); setFormError("");
  };

  const closeForm = () => {
    setFormMode(null);
    setEditingUser(null);
    setName(""); setEmail(""); setPassword(""); setFormError("");
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");

    if (formMode === "create") {
      if (!name.trim() || !email.trim() || !password.trim()) {
        setFormError("All fields are required.");
        return;
      }
      mutateFetcher.submit(
        JSON.stringify({ intent: "create", name: name.trim(), email: email.trim(), password }),
        { method: "POST", action: "/app/api/users", encType: "application/json" }
      );
    }
  };

  const handleDelete = (userId: string) => {
    mutateFetcher.submit(
      JSON.stringify({ intent: "delete", userId }),
      { method: "POST", action: "/app/api/users", encType: "application/json" }
    );
  };

  const isSubmitting = mutateFetcher.state !== "idle";
  const isLoading = listFetcher.state === "loading";
  const users = listFetcher.data?.users ?? [];

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h2 className="text-base font-semibold text-foreground">User Management</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Manage warehouse operator accounts that can log into the INK Warehouse App.
          </p>
        </div>
        {formMode === null && (
          <Button onClick={openCreate} size="sm" className="flex items-center gap-2">
            <Plus className="h-4 w-4" />
            Add New User
          </Button>
        )}
      </div>

      {/* Inline form */}
      {formMode !== null && (
        <div className="border border-border rounded-sm p-5 mb-6 bg-muted/30">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-foreground">
              Add New User
            </h3>
            <button onClick={closeForm} className="text-muted-foreground hover:text-foreground transition-colors">
              <X className="h-4 w-4" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1 uppercase tracking-wide">Name</label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Jane Smith"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1 uppercase tracking-wide">Email</label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="jane@warehouse.com"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1 uppercase tracking-wide">
                Password
              </label>
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {formError && (
              <p className="text-sm text-destructive">{formError}</p>
            )}

            <div className="flex gap-3 pt-1">
              <Button type="submit" size="sm" disabled={isSubmitting}>
                {isSubmitting ? (
                  <><Loader2 className="h-3 w-3 animate-spin mr-2" /> Saving...</>
                ) : "Add User"}
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={closeForm} disabled={isSubmitting}>
                Cancel
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* User Table */}
      {isLoading && users.length === 0 ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-3" />
          <span className="text-sm">Loading users…</span>
        </div>
      ) : users.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-3">
            <Users className="h-5 w-5 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium text-foreground">No warehouse users yet</p>
          <p className="text-xs text-muted-foreground mt-1">Click "Add New User" to create the first operator account.</p>
        </div>
      ) : (
        <div className="border border-border rounded-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Name</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Email</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide hidden sm:table-cell">Role</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide hidden sm:table-cell">Added</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user, idx) => (
                <tr key={user.id} className={`border-b border-border last:border-0 ${idx % 2 === 0 ? "" : "bg-muted/10"}`}>
                  <td className="px-4 py-3 font-medium text-foreground">{user.name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{user.email}</td>
                  <td className="px-4 py-3 hidden sm:table-cell">
                    <span className="inline-flex items-center gap-1 text-xs bg-muted px-2 py-0.5 rounded-full">
                      <ShieldCheck className="h-3 w-3" />
                      {user.role}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs hidden sm:table-cell">
                    {user.createdAt ? new Date(user.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {deleteConfirmId === user.id ? (
                      <div className="flex items-center justify-end gap-2">
                        <span className="text-xs text-muted-foreground">Delete?</span>
                        <button
                          onClick={() => handleDelete(user.id)}
                          disabled={isSubmitting}
                          className="text-xs text-destructive font-medium hover:underline disabled:opacity-50"
                        >
                          Yes
                        </button>
                        <button
                          onClick={() => setDeleteConfirmId(null)}
                          className="text-xs text-muted-foreground hover:text-foreground"
                        >
                          No
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => setDeleteConfirmId(user.id)}
                          className="p-1.5 rounded-sm text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                          title="Delete user"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-muted-foreground mt-4 flex items-center gap-1.5">
        <ShieldCheck className="h-3.5 w-3.5" />
        Passwords are encrypted and never stored in plain text. A welcome email with credentials is sent to each new user.
      </p>
    </div>
  );
}
