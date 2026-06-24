import { AdminLayout } from "@/components/admin-layout";
import { useAuth } from "@/lib/auth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  Search, Plus, Trash2, Send, Settings, History, Users,
  CheckCircle, Clock, AlertCircle, RefreshCw, Play, FileText,
  ToggleLeft, ToggleRight, Zap, Wifi, WifiOff, Eye
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { motion } from "framer-motion";

const API = (path: string, token: string, opts?: RequestInit) =>
  fetch(`/api${path}`, {
    ...opts,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(opts?.headers ?? {}) },
  }).then(async r => {
    const data = await r.json();
    if (!r.ok) throw new Error(data.error ?? `HTTP ${r.status}`);
    return data;
  });

type GroupStatus = "discovered" | "queued" | "joining" | "joined" | "ready" | "cooldown" | "failed" | "removed";
type PostStatus = "sent" | "failed" | "flood_waited";

interface OutreachGroup {
  id: number;
  telegramId: string;
  username: string | null;
  title: string;
  memberCount: number;
  status: GroupStatus;
  joinedAt: string | null;
  coldPeriodEndsAt: string | null;
  lastPostedAt: string | null;
  cooldownEndsAt: string | null;
  notes: string | null;
  isActive: boolean;
  lastError: string | null;
  createdAt: string;
}

interface OutreachTemplate {
  id: number;
  name: string;
  body: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface DiscoveredGroup {
  telegramId: string;
  username: string | null;
  title: string;
  memberCount: number;
}

interface PostRecord {
  id: number;
  status: PostStatus;
  renderedBody: string;
  sentAt: string;
  error: string | null;
  groupTitle: string | null;
  groupUsername: string | null;
  templateName: string | null;
}

interface OutreachConfig {
  config: Record<string, string>;
  service: { ok: boolean; connected: boolean; lastTickAt: string | null; tickCount: number };
}

const STATUS_STYLES: Record<GroupStatus, string> = {
  discovered: "bg-muted text-muted-foreground",
  queued:     "bg-blue-500/20 text-blue-300",
  joining:    "bg-amber-500/20 text-amber-300",
  joined:     "bg-cyan-500/20 text-cyan-300",
  ready:      "bg-green-500/20 text-green-300",
  cooldown:   "bg-orange-500/20 text-orange-300",
  failed:     "bg-red-500/20 text-red-400",
  removed:    "bg-muted/30 text-muted-foreground/50",
};

function StatusBadge({ status }: { status: GroupStatus }) {
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-mono uppercase tracking-wider ${STATUS_STYLES[status]}`}>
      {status}
    </span>
  );
}

function timeUntil(dateStr: string | null): string {
  if (!dateStr) return "";
  const diff = new Date(dateStr).getTime() - Date.now();
  if (diff <= 0) return "soon";
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return "never";
  const diff = Date.now() - new Date(dateStr).getTime();
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  if (h > 24) return `${Math.floor(h / 24)}d ago`;
  if (h > 0) return `${h}h ago`;
  return `${m}m ago`;
}

const TABS = [
  { id: "discovery", label: "Discovery", icon: Search },
  { id: "groups",    label: "Groups",    icon: Users },
  { id: "templates", label: "Templates", icon: FileText },
  { id: "scheduler", label: "Scheduler", icon: Settings },
  { id: "history",   label: "History",   icon: History },
] as const;

type TabId = typeof TABS[number]["id"];

export function AdminOutreach() {
  const { adminToken } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<TabId>("discovery");

  const { data: groupsData = [] } = useQuery<OutreachGroup[]>({
    queryKey: ["outreach-groups"],
    queryFn: () => API("/admin/outreach/groups", adminToken ?? ""),
    enabled: !!adminToken,
    refetchInterval: 30_000,
  });

  const { data: templatesData = [] } = useQuery<OutreachTemplate[]>({
    queryKey: ["outreach-templates"],
    queryFn: () => API("/admin/outreach/templates", adminToken ?? ""),
    enabled: !!adminToken,
  });

  const { data: configData, isLoading: configLoading } = useQuery<OutreachConfig>({
    queryKey: ["outreach-config"],
    queryFn: () => API("/admin/outreach/config", adminToken ?? ""),
    enabled: !!adminToken,
    refetchInterval: 15_000,
  });

  const groups = groupsData.filter(g => g.status !== "removed");

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-mono font-bold flex items-center gap-2">
            <Send className="w-6 h-6 text-primary" />
            Community Outreach
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Discover Telegram groups, manage outreach, schedule posts — all configurable.
          </p>
        </div>

        <div className="flex gap-1 border-b border-border">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-mono transition-colors border-b-2 -mb-px ${
                activeTab === id
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon size={13} />
              {label}
              {id === "groups" && groups.length > 0 && (
                <span className="ml-1 px-1.5 py-0.5 rounded bg-primary/20 text-primary text-[10px] font-mono">
                  {groups.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {activeTab === "discovery" && (
          <DiscoveryTab
            token={adminToken ?? ""}
            existingGroups={groupsData}
            onAdded={() => qc.invalidateQueries({ queryKey: ["outreach-groups"] })}
            toast={toast}
          />
        )}
        {activeTab === "groups" && (
          <GroupsTab
            token={adminToken ?? ""}
            groups={groups}
            onChange={() => qc.invalidateQueries({ queryKey: ["outreach-groups"] })}
            toast={toast}
          />
        )}
        {activeTab === "templates" && (
          <TemplatesTab
            token={adminToken ?? ""}
            templates={templatesData}
            onChange={() => qc.invalidateQueries({ queryKey: ["outreach-templates"] })}
            toast={toast}
          />
        )}
        {activeTab === "scheduler" && (
          <SchedulerTab
            token={adminToken ?? ""}
            configData={configData ?? null}
            isLoading={configLoading}
            templates={templatesData}
            onChange={() => qc.invalidateQueries({ queryKey: ["outreach-config"] })}
            toast={toast}
          />
        )}
        {activeTab === "history" && (
          <HistoryTab token={adminToken ?? ""} />
        )}
      </div>
    </AdminLayout>
  );
}

// ── DISCOVERY TAB ─────────────────────────────────────────────────────────

function DiscoveryTab({
  token, existingGroups, onAdded, toast,
}: {
  token: string;
  existingGroups: OutreachGroup[];
  onAdded: () => void;
  toast: ReturnType<typeof useToast>["toast"];
}) {
  const [keyword, setKeyword] = useState("");
  const [results, setResults] = useState<DiscoveredGroup[]>([]);
  const [searching, setSearching] = useState(false);
  const [addingId, setAddingId] = useState<string | null>(null);

  // Add by link / username
  const [directInput, setDirectInput] = useState("");
  const [directTitle, setDirectTitle] = useState("");
  const [directAdding, setDirectAdding] = useState(false);

  async function handleAddDirect() {
    const raw = directInput.trim();
    if (!raw || !directTitle.trim()) return;
    const username = raw.replace(/^https?:\/\/t\.me\//i, "").replace(/^@/, "").split(/[/?]/)[0];
    if (!username) { toast({ title: "Invalid link or username", variant: "destructive" }); return; }
    setDirectAdding(true);
    try {
      await API("/admin/outreach/groups", token, {
        method: "POST",
        body: JSON.stringify({ telegramId: username, username, title: directTitle.trim(), memberCount: 0 }),
      });
      toast({ title: "Group added", description: `@${username}` });
      setDirectInput(""); setDirectTitle("");
      onAdded();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("already in list")) {
        toast({ title: "Already in list", description: `@${username}` });
      } else {
        toast({ title: "Failed to add", description: msg, variant: "destructive" });
      }
    } finally {
      setDirectAdding(false);
    }
  }

  const existingIds = new Set(existingGroups.map(g => g.telegramId));

  async function handleSearch() {
    if (!keyword.trim()) return;
    setSearching(true);
    try {
      const data = await API("/admin/outreach/search", token, {
        method: "POST",
        body: JSON.stringify({ keyword: keyword.trim(), limit: 25 }),
      });
      setResults(data as DiscoveredGroup[]);
    } catch (err) {
      toast({ title: "Search failed", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    } finally {
      setSearching(false);
    }
  }

  async function handleAdd(group: DiscoveredGroup) {
    setAddingId(group.telegramId);
    try {
      await API("/admin/outreach/groups", token, {
        method: "POST",
        body: JSON.stringify(group),
      });
      toast({ title: "Added to list", description: group.title });
      onAdded();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes("already in list")) {
        toast({ title: "Already in list", description: group.title });
      } else {
        toast({ title: "Failed to add", description: message, variant: "destructive" });
      }
    } finally {
      setAddingId(null);
    }
  }

  return (
    <div className="space-y-5">
      {/* Add by link / username */}
      <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-3">
        <p className="text-xs font-mono font-semibold text-primary flex items-center gap-1.5">
          <Plus size={12} /> Add Group by Link or Username
        </p>
        <div className="grid grid-cols-1 gap-2">
          <Input
            value={directInput}
            onChange={e => setDirectInput(e.target.value)}
            placeholder="t.me/groupname or @groupname"
            className="font-mono text-sm"
          />
          <div className="flex gap-2">
            <Input
              value={directTitle}
              onChange={e => setDirectTitle(e.target.value)}
              placeholder="Group display name"
              className="font-mono text-sm flex-1"
            />
            <Button
              onClick={handleAddDirect}
              disabled={directAdding || !directInput.trim() || !directTitle.trim()}
              className="gap-2 font-mono shrink-0"
              size="sm"
            >
              <Plus size={12} /> {directAdding ? "Adding..." : "Add"}
            </Button>
          </div>
        </div>
        <p className="text-[10px] text-muted-foreground font-mono">
          Paste a Telegram group link (t.me/...) or @username. The group will be added with status <span className="text-primary">discovered</span> and queued for joining.
        </p>
      </div>

      {/* Keyword Search */}
      <div>
        <p className="text-xs font-mono text-muted-foreground mb-2">Or search by keyword:</p>
        <div className="flex gap-3">
          <Input
            value={keyword}
            onChange={e => setKeyword(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleSearch()}
            placeholder='e.g. "crypto gaming", "web3 mini apps", "telegram games"'
            className="font-mono flex-1"
          />
          <Button onClick={handleSearch} disabled={searching || !keyword.trim()} className="gap-2 font-mono">
            <Search className="w-4 h-4" />
            {searching ? "Searching..." : "Search"}
          </Button>
        </div>
      </div>

      {results.length === 0 && !searching && (
        <div className="text-center py-8 text-muted-foreground text-sm font-mono">
          Search for Telegram groups by keyword. Results appear here.
        </div>
      )}

      {results.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs text-muted-foreground font-mono mb-3">{results.length} groups found</div>
          {results.map(group => {
            const alreadyAdded = existingIds.has(group.telegramId);
            return (
              <div key={group.telegramId} className="flex items-center gap-4 bg-card border border-border rounded-lg px-4 py-3">
                <div className="flex-1 min-w-0">
                  <div className="font-mono font-semibold text-sm truncate">{group.title}</div>
                  <div className="text-xs text-muted-foreground font-mono mt-0.5">
                    {group.username ? `@${group.username}` : `ID: ${group.telegramId}`}
                    {" · "}
                    {group.memberCount.toLocaleString()} members
                  </div>
                </div>
                {alreadyAdded ? (
                  <span className="text-xs font-mono text-green-400 flex items-center gap-1">
                    <CheckCircle size={12} /> Added
                  </span>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleAdd(group)}
                    disabled={addingId === group.telegramId}
                    className="font-mono gap-1.5 text-xs"
                  >
                    <Plus size={12} /> Add to List
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── GROUPS TAB ─────────────────────────────────────────────────────────────

function GroupsTab({
  token, groups, onChange, toast,
}: {
  token: string;
  groups: OutreachGroup[];
  onChange: () => void;
  toast: ReturnType<typeof useToast>["toast"];
}) {
  const [editNotes, setEditNotes] = useState<Record<number, string>>({});
  const [postNow, setPostNow] = useState<{ id: number; message: string } | null>(null);

  async function handleQueue(id: number) {
    try {
      await API(`/admin/outreach/groups/${id}/queue`, token, { method: "POST" });
      toast({ title: "Group queued for joining" });
      onChange();
    } catch (err) {
      toast({ title: "Queue failed", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    }
  }

  async function handleToggleActive(group: OutreachGroup) {
    try {
      await API(`/admin/outreach/groups/${group.id}`, token, {
        method: "PATCH",
        body: JSON.stringify({ isActive: !group.isActive }),
      });
      onChange();
    } catch (err) {
      toast({ title: "Update failed", variant: "destructive" });
    }
  }

  async function handleRemove(id: number) {
    try {
      await API(`/admin/outreach/groups/${id}`, token, { method: "DELETE" });
      toast({ title: "Group removed" });
      onChange();
    } catch (err) {
      toast({ title: "Remove failed", variant: "destructive" });
    }
  }

  async function handleSaveNotes(id: number) {
    try {
      await API(`/admin/outreach/groups/${id}`, token, {
        method: "PATCH",
        body: JSON.stringify({ notes: editNotes[id] }),
      });
      toast({ title: "Notes saved" });
      onChange();
      setEditNotes(prev => { const n = { ...prev }; delete n[id]; return n; });
    } catch (err) {
      toast({ title: "Save failed", variant: "destructive" });
    }
  }

  async function handlePostNow() {
    if (!postNow?.message.trim()) return;
    try {
      await API(`/admin/outreach/groups/${postNow.id}/post-now`, token, {
        method: "POST",
        body: JSON.stringify({ message: postNow.message }),
      });
      toast({ title: "Message sent" });
      setPostNow(null);
      onChange();
    } catch (err) {
      toast({ title: "Post failed", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    }
  }

  if (groups.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground text-sm font-mono">
        No groups yet. Use the Discovery tab to find and add groups.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {postNow && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-xl p-6 w-full max-w-lg space-y-4">
            <h3 className="font-mono font-bold">Post Now</h3>
            <textarea
              className="w-full bg-background border border-border rounded-lg p-3 text-sm font-mono resize-none h-32"
              value={postNow.message}
              onChange={e => setPostNow(prev => prev ? { ...prev, message: e.target.value } : null)}
              placeholder="Enter message..."
            />
            <div className="flex gap-3 justify-end">
              <Button variant="outline" onClick={() => setPostNow(null)} className="font-mono">Cancel</Button>
              <Button onClick={handlePostNow} disabled={!postNow.message.trim()} className="font-mono gap-2">
                <Send size={14} /> Send
              </Button>
            </div>
          </div>
        </div>
      )}

      {groups.map(group => (
        <div key={group.id} className={`bg-card border rounded-xl p-4 space-y-3 ${group.status === "failed" ? "border-red-500/30" : "border-border"}`}>
          <div className="flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono font-semibold text-sm">{group.title}</span>
                <StatusBadge status={group.status} />
                {!group.isActive && (
                  <span className="text-xs font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">paused</span>
                )}
              </div>
              <div className="text-xs text-muted-foreground font-mono mt-0.5">
                {group.username ? `@${group.username}` : `ID: ${group.telegramId}`}
                {" · "}
                {(group.memberCount ?? 0).toLocaleString()} members
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => handleToggleActive(group)} className="text-muted-foreground hover:text-foreground">
                {group.isActive ? <ToggleRight size={20} className="text-green-400" /> : <ToggleLeft size={20} />}
              </button>
              <button
                onClick={() => setPostNow({ id: group.id, message: "" })}
                className="text-muted-foreground hover:text-primary"
                title="Post now"
              >
                <Send size={14} />
              </button>
              <button onClick={() => handleRemove(group.id)} className="text-muted-foreground hover:text-destructive">
                <Trash2 size={14} />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 text-xs font-mono">
            {group.status === "joined" && group.coldPeriodEndsAt && (
              <div className="bg-background rounded px-2 py-1.5">
                <div className="text-muted-foreground text-[10px]">Cold period ends</div>
                <div className="text-cyan-300">{timeUntil(group.coldPeriodEndsAt)}</div>
              </div>
            )}
            {group.status === "cooldown" && group.cooldownEndsAt && (
              <div className="bg-background rounded px-2 py-1.5">
                <div className="text-muted-foreground text-[10px]">Cooldown ends</div>
                <div className="text-orange-300">{timeUntil(group.cooldownEndsAt)}</div>
              </div>
            )}
            {group.lastPostedAt && (
              <div className="bg-background rounded px-2 py-1.5">
                <div className="text-muted-foreground text-[10px]">Last posted</div>
                <div className="text-foreground">{timeAgo(group.lastPostedAt)}</div>
              </div>
            )}
            {group.joinedAt && (
              <div className="bg-background rounded px-2 py-1.5">
                <div className="text-muted-foreground text-[10px]">Joined</div>
                <div className="text-foreground">{timeAgo(group.joinedAt)}</div>
              </div>
            )}
          </div>

          {group.lastError && (
            <div className="text-xs text-red-400 font-mono bg-red-500/10 rounded px-2 py-1.5 flex items-center gap-1.5">
              <AlertCircle size={11} /> {group.lastError}
            </div>
          )}

          {(["discovered", "failed"] as GroupStatus[]).includes(group.status) && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleQueue(group.id)}
              className="font-mono gap-1.5 text-xs h-7"
            >
              <Clock size={11} /> Queue for Joining
            </Button>
          )}

          <div className="flex gap-2">
            <Input
              className="text-xs font-mono h-7 flex-1"
              placeholder="Add notes..."
              value={editNotes[group.id] ?? group.notes ?? ""}
              onChange={e => setEditNotes(prev => ({ ...prev, [group.id]: e.target.value }))}
            />
            {editNotes[group.id] !== undefined && editNotes[group.id] !== (group.notes ?? "") && (
              <Button size="sm" onClick={() => handleSaveNotes(group.id)} className="h-7 text-xs font-mono px-2">Save</Button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── TEMPLATES TAB ─────────────────────────────────────────────────────────

function TemplatesTab({
  token, templates, onChange, toast,
}: {
  token: string;
  templates: OutreachTemplate[];
  onChange: () => void;
  toast: ReturnType<typeof useToast>["toast"];
}) {
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [body, setBody] = useState("");
  const [preview, setPreview] = useState(false);

  const PREVIEW_VARS: Record<string, string> = {
    platform: "StrikerX",
    promo_url: "t.me/StrykkerXBot/StrikerX",
    game: "The Shot, Penalty, Minefield, Free Kick",
  };

  function renderPreview(text: string) {
    return text.replace(/\{(\w+)\}/g, (_, key: string) => PREVIEW_VARS[key] ?? `{${key}}`);
  }

  function startEdit(t: OutreachTemplate) {
    setEditId(t.id);
    setName(t.name);
    setBody(t.body);
    setShowForm(true);
    setPreview(false);
  }

  function resetForm() {
    setShowForm(false);
    setEditId(null);
    setName("");
    setBody("");
    setPreview(false);
  }

  async function handleSave() {
    if (!name.trim() || !body.trim()) return;
    try {
      if (editId) {
        await API(`/admin/outreach/templates/${editId}`, token, {
          method: "PATCH",
          body: JSON.stringify({ name, body }),
        });
        toast({ title: "Template updated" });
      } else {
        await API("/admin/outreach/templates", token, {
          method: "POST",
          body: JSON.stringify({ name, body }),
        });
        toast({ title: "Template created" });
      }
      resetForm();
      onChange();
    } catch (err) {
      toast({ title: "Save failed", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    }
  }

  async function handleToggle(t: OutreachTemplate) {
    try {
      await API(`/admin/outreach/templates/${t.id}`, token, {
        method: "PATCH",
        body: JSON.stringify({ isActive: !t.isActive }),
      });
      onChange();
    } catch {
      toast({ title: "Update failed", variant: "destructive" });
    }
  }

  async function handleDelete(id: number) {
    try {
      await API(`/admin/outreach/templates/${id}`, token, { method: "DELETE" });
      toast({ title: "Template deleted" });
      onChange();
    } catch {
      toast({ title: "Delete failed", variant: "destructive" });
    }
  }

  return (
    <div className="space-y-5">
      {!showForm && (
        <Button onClick={() => setShowForm(true)} className="font-mono gap-2" variant="outline">
          <Plus size={14} /> New Template
        </Button>
      )}

      {showForm && (
        <div className="bg-card border border-border rounded-xl p-5 space-y-4">
          <h3 className="font-mono font-semibold text-sm">{editId ? "Edit Template" : "New Template"}</h3>
          <div>
            <label className="text-xs font-mono text-muted-foreground block mb-1">Template Name</label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Standard Promo" className="font-mono" />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-mono text-muted-foreground">Message Body</label>
              <button
                onClick={() => setPreview(p => !p)}
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 font-mono"
              >
                <Eye size={11} /> {preview ? "Edit" : "Preview"}
              </button>
            </div>
            {preview ? (
              <div className="bg-background border border-border rounded-lg p-3 text-sm font-mono whitespace-pre-wrap min-h-[100px] text-foreground">
                {renderPreview(body)}
              </div>
            ) : (
              <textarea
                className="w-full bg-background border border-border rounded-lg p-3 text-sm font-mono resize-none h-28 focus:outline-none focus:ring-1 focus:ring-primary"
                value={body}
                onChange={e => setBody(e.target.value)}
                placeholder="Use {platform}, {promo_url}, {game} as variables"
              />
            )}
            <p className="text-[10px] text-muted-foreground font-mono mt-1">
              Variables: <code className="text-primary">{`{platform}`}</code> · <code className="text-primary">{`{promo_url}`}</code> · <code className="text-primary">{`{game}`}</code>
            </p>
          </div>
          <div className="flex gap-3">
            <Button onClick={handleSave} disabled={!name.trim() || !body.trim()} className="font-mono gap-2">
              <CheckCircle size={14} /> {editId ? "Save Changes" : "Create Template"}
            </Button>
            <Button variant="outline" onClick={resetForm} className="font-mono">Cancel</Button>
          </div>
        </div>
      )}

      {templates.length === 0 && !showForm && (
        <div className="text-center py-12 text-muted-foreground text-sm font-mono">
          No templates yet. Create one to start posting.
        </div>
      )}

      <div className="space-y-3">
        {templates.map(t => (
          <div key={t.id} className={`bg-card border rounded-xl p-4 ${t.isActive ? "border-border" : "border-border/40 opacity-60"}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono font-semibold text-sm">{t.name}</span>
                  {t.isActive && (
                    <span className="text-[10px] font-mono bg-green-500/20 text-green-300 px-1.5 py-0.5 rounded uppercase">active</span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground font-mono mt-1 line-clamp-2">{t.body}</p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button onClick={() => handleToggle(t)} className="text-muted-foreground hover:text-foreground">
                  {t.isActive ? <ToggleRight size={18} className="text-green-400" /> : <ToggleLeft size={18} />}
                </button>
                <button onClick={() => startEdit(t)} className="text-muted-foreground hover:text-primary">
                  <Settings size={14} />
                </button>
                <button onClick={() => handleDelete(t.id)} className="text-muted-foreground hover:text-destructive">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── SCHEDULER TAB ─────────────────────────────────────────────────────────

function SchedulerTab({
  token, configData, isLoading, templates, onChange, toast,
}: {
  token: string;
  configData: OutreachConfig | null;
  isLoading: boolean;
  templates: OutreachTemplate[];
  onChange: () => void;
  toast: ReturnType<typeof useToast>["toast"];
}) {
  const config = configData?.config ?? {};
  const service = configData?.service ?? { ok: false, connected: false, lastTickAt: null, tickCount: 0 };

  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [ticking, setTicking] = useState(false);

  function val(key: string) {
    return form[key] !== undefined ? form[key] : (config[key] ?? "");
  }

  function set(key: string, value: string) {
    setForm(prev => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    setSaving(true);
    try {
      await fetch(`/api/admin/outreach/config`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ ...config, ...form }),
      }).then(r => r.json());
      toast({ title: "Config saved" });
      setForm({});
      onChange();
    } catch {
      toast({ title: "Save failed", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function handleRunTick() {
    setTicking(true);
    try {
      const res = await fetch(`/api/admin/outreach/tick`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      }).then(r => r.json());
      toast({ title: `Tick completed`, description: `Joined: ${res.joined ?? 0} · Posted: ${res.posted ?? 0}` });
      onChange();
    } catch {
      toast({ title: "Tick failed", description: "Outreach service may not be running", variant: "destructive" });
    } finally {
      setTicking(false);
    }
  }

  async function handleToggleMaster() {
    const newVal = val("outreach_enabled") === "true" ? "false" : "true";
    try {
      await fetch(`/api/admin/outreach/config`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ outreach_enabled: newVal }),
      });
      toast({ title: newVal === "true" ? "Outreach enabled" : "Outreach paused" });
      onChange();
    } catch {
      toast({ title: "Toggle failed", variant: "destructive" });
    }
  }

  if (isLoading) return <div className="text-sm text-muted-foreground font-mono">Loading config...</div>;

  const isEnabled = val("outreach_enabled") === "true";

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Service Status */}
      <div className="bg-card border border-border rounded-xl p-5">
        <h2 className="font-mono font-semibold text-sm mb-4 flex items-center gap-2">
          {service.connected ? <Wifi size={14} className="text-green-400" /> : <WifiOff size={14} className="text-red-400" />}
          Service Status
        </h2>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="bg-background rounded-lg p-3">
            <div className="text-xs text-muted-foreground font-mono mb-1">Telegram Session</div>
            <div className={`font-mono font-bold text-xs ${service.connected ? "text-green-400" : "text-red-400"}`}>
              {service.connected ? "Connected" : "Disconnected"}
            </div>
            {!service.connected && (
              <div className="text-[10px] text-muted-foreground font-mono mt-1">
                Set OUTREACH_API_ID, OUTREACH_API_HASH, OUTREACH_SESSION_STRING
              </div>
            )}
          </div>
          <div className="bg-background rounded-lg p-3">
            <div className="text-xs text-muted-foreground font-mono mb-1">Last Scheduler Tick</div>
            <div className="font-mono font-bold text-xs">{service.lastTickAt ? timeAgo(service.lastTickAt) : "never"}</div>
          </div>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={handleRunTick}
          disabled={ticking || !service.connected}
          className="mt-3 font-mono gap-2 text-xs"
        >
          <Play size={11} /> {ticking ? "Running..." : "Run Tick Now"}
        </Button>
      </div>

      {/* Master Toggle */}
      <div className={`border rounded-xl p-5 ${isEnabled ? "bg-green-500/5 border-green-500/30" : "bg-card border-border"}`}>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-mono font-semibold text-sm">Outreach Engine</h2>
            <p className="text-xs text-muted-foreground font-mono mt-0.5">
              {isEnabled ? "Active — scheduler is running join queue and post queue" : "Paused — no automatic actions"}
            </p>
          </div>
          <button onClick={handleToggleMaster}>
            {isEnabled
              ? <ToggleRight size={32} className="text-green-400" />
              : <ToggleLeft size={32} className="text-muted-foreground" />}
          </button>
        </div>
      </div>

      {/* Timing Config */}
      <div className="bg-card border border-border rounded-xl p-5 space-y-4">
        <h2 className="font-mono font-semibold text-sm flex items-center gap-2">
          <RefreshCw size={13} /> Join Behaviour
        </h2>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="text-xs font-mono text-muted-foreground block mb-1">Max joins / day</label>
            <Input
              type="number" min="1" max="20"
              value={val("outreach_join_max_per_day")}
              onChange={e => set("outreach_join_max_per_day", e.target.value)}
              className="font-mono"
            />
          </div>
          <div>
            <label className="text-xs font-mono text-muted-foreground block mb-1">Min delay (hours)</label>
            <Input
              type="number" min="0.5" step="0.5"
              value={val("outreach_join_delay_min_hours")}
              onChange={e => set("outreach_join_delay_min_hours", e.target.value)}
              className="font-mono"
            />
          </div>
          <div>
            <label className="text-xs font-mono text-muted-foreground block mb-1">Max delay (hours)</label>
            <Input
              type="number" min="1" step="0.5"
              value={val("outreach_join_delay_max_hours")}
              onChange={e => set("outreach_join_delay_max_hours", e.target.value)}
              className="font-mono"
            />
          </div>
        </div>
        <p className="text-[10px] text-muted-foreground font-mono">
          Delays are jittered randomly between min and max — looks organic to Telegram.
        </p>
      </div>

      <div className="bg-card border border-border rounded-xl p-5 space-y-4">
        <h2 className="font-mono font-semibold text-sm flex items-center gap-2">
          <Clock size={13} /> Post Timing
        </h2>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-mono text-muted-foreground block mb-1">Cold period after join (hours)</label>
            <Input
              type="number" min="1" step="1"
              value={val("outreach_cold_period_hours")}
              onChange={e => set("outreach_cold_period_hours", e.target.value)}
              className="font-mono"
            />
          </div>
          <div>
            <label className="text-xs font-mono text-muted-foreground block mb-1">Cooldown between posts (hours)</label>
            <Input
              type="number" min="12" step="1"
              value={val("outreach_post_cooldown_hours")}
              onChange={e => set("outreach_post_cooldown_hours", e.target.value)}
              className="font-mono"
            />
          </div>
        </div>
      </div>

      {/* Template Variables */}
      <div className="bg-card border border-border rounded-xl p-5 space-y-4">
        <h2 className="font-mono font-semibold text-sm flex items-center gap-2">
          <Zap size={13} /> Template Variables
        </h2>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-mono text-muted-foreground block mb-1">
              <code className="text-primary">{`{platform}`}</code> value
            </label>
            <Input
              value={val("outreach_platform_name")}
              onChange={e => set("outreach_platform_name", e.target.value)}
              placeholder="StrikerX"
              className="font-mono"
            />
          </div>
          <div>
            <label className="text-xs font-mono text-muted-foreground block mb-1">
              <code className="text-primary">{`{promo_url}`}</code> value
            </label>
            <Input
              value={val("outreach_promo_url")}
              onChange={e => set("outreach_promo_url", e.target.value)}
              placeholder="t.me/StrykkerXBot/StrikerX"
              className="font-mono"
            />
          </div>
        </div>
      </div>

      {Object.keys(form).length > 0 && (
        <Button onClick={handleSave} disabled={saving} className="font-mono gap-2">
          <CheckCircle size={14} /> {saving ? "Saving..." : "Save Config"}
        </Button>
      )}
    </div>
  );
}

// ── HISTORY TAB ───────────────────────────────────────────────────────────

function HistoryTab({ token }: { token: string }) {
  const [offset, setOffset] = useState(0);
  const LIMIT = 50;

  const { data: posts = [], isLoading } = useQuery<PostRecord[]>({
    queryKey: ["outreach-posts", offset],
    queryFn: () =>
      fetch(`/api/admin/outreach/posts?limit=${LIMIT}&offset=${offset}`, {
        headers: { Authorization: `Bearer ${token}` },
      }).then(r => r.json()),
    enabled: !!token,
  });

  const POST_STATUS_STYLE: Record<PostStatus, string> = {
    sent: "text-green-400",
    failed: "text-red-400",
    flood_waited: "text-amber-400",
  };

  if (isLoading) return <div className="text-sm text-muted-foreground font-mono">Loading...</div>;

  if (posts.length === 0 && offset === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground text-sm font-mono">
        No posts yet. Once the scheduler posts messages, they appear here.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="px-4 py-2.5 text-left text-xs font-mono text-muted-foreground">Time</th>
              <th className="px-4 py-2.5 text-left text-xs font-mono text-muted-foreground">Group</th>
              <th className="px-4 py-2.5 text-left text-xs font-mono text-muted-foreground">Template</th>
              <th className="px-4 py-2.5 text-left text-xs font-mono text-muted-foreground">Status</th>
              <th className="px-4 py-2.5 text-left text-xs font-mono text-muted-foreground">Error</th>
            </tr>
          </thead>
          <tbody>
            {posts.map(post => (
              <tr key={post.id} className="border-b border-border/50 hover:bg-muted/20">
                <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground whitespace-nowrap">
                  {new Date(post.sentAt).toLocaleString()}
                </td>
                <td className="px-4 py-2.5 font-mono text-xs">
                  {post.groupTitle ?? "—"}
                  {post.groupUsername && (
                    <span className="text-muted-foreground ml-1">@{post.groupUsername}</span>
                  )}
                </td>
                <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">
                  {post.templateName ?? "manual"}
                </td>
                <td className="px-4 py-2.5">
                  <span className={`font-mono text-xs uppercase ${POST_STATUS_STYLE[post.status]}`}>
                    {post.status}
                  </span>
                </td>
                <td className="px-4 py-2.5 font-mono text-xs text-red-400/80 max-w-[200px] truncate">
                  {post.error ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex gap-3">
        <Button size="sm" variant="outline" onClick={() => setOffset(Math.max(0, offset - LIMIT))} disabled={offset === 0} className="font-mono text-xs">
          Previous
        </Button>
        <Button size="sm" variant="outline" onClick={() => setOffset(offset + LIMIT)} disabled={posts.length < LIMIT} className="font-mono text-xs">
          Next
        </Button>
      </div>
    </div>
  );
}
