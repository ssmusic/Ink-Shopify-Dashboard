import { useState, useEffect, useCallback } from "react";
import { useFetcher, useRouteLoaderData } from "react-router";
import {
  BlockStack,
  Card,
  Text,
  TextField,
  Button,
  InlineStack,
  Avatar,
  Badge,
  IndexTable,
  Modal,
  Select,
  Layout,
  Icon,
} from "@shopify/polaris";
import { PlusIcon, DeleteIcon, SearchIcon, ClipboardIcon } from "@shopify/polaris-icons";
import { useShop } from "../../contexts/ShopContext";
import { Copy, Download, ExternalLink } from "lucide-react";

interface WarehouseUser {
  id: string;
  name: string;
  email: string;
  role: string;
  createdAt: string | null;
}

const UserManagementSettings = () => {
  const { currentShop } = useShop();
  // Dynamic data from the `app.settings` route loader
  const shopData = useRouteLoaderData("routes/app.settings") as any;
  
  const listFetcher = useFetcher<{ users: WarehouseUser[] }>();
  const mutateFetcher = useFetcher<{ success?: boolean; error?: string; userId?: string }>();

  const [search, setSearch] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);
  
  // Form state
  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [invitePassword, setInvitePassword] = useState("");
  const [inviteRole, setInviteRole] = useState("operator");

  // Load users on mount
  useEffect(() => {
    listFetcher.load("/app/api/users");
  }, []);

  // After a successful mutation, reload list and close form
  useEffect(() => {
    if (mutateFetcher.state === "idle" && mutateFetcher.data) {
      if (mutateFetcher.data.success) {
        setInviteOpen(false);
        setInviteName("");
        setInviteEmail("");
        setInvitePassword("");
        // Reload the list
        listFetcher.load("/app/api/users");
      }
    }
  }, [mutateFetcher.state, mutateFetcher.data]);

  const handleInvite = useCallback(() => {
    if (!inviteName || !inviteEmail || !invitePassword) return;
    
    mutateFetcher.submit(
      JSON.stringify({ 
        intent: "create", 
        name: inviteName.trim(), 
        email: inviteEmail.trim(), 
        password: invitePassword 
      }),
      { method: "POST", action: "/app/api/users", encType: "application/json" }
    );
  }, [inviteName, inviteEmail, invitePassword]);

  const handleRemove = useCallback((id: string) => {
    mutateFetcher.submit(
      JSON.stringify({ intent: "delete", userId: id }),
      { method: "POST", action: "/app/api/users", encType: "application/json" }
    );
  }, []);

  const users = listFetcher.data?.users ?? [];
  const filtered = users.filter(
    (m) =>
      m.name.toLowerCase().includes(search.toLowerCase()) ||
      m.email.toLowerCase().includes(search.toLowerCase())
  );

  const getInitials = (name: string) =>
    name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);

  const merchantId = shopData?.shopId || "MID-7X92KF";
  const storeName = shopData?.shopName || currentShop?.name || "Luminary Goods";

  const isSubmitting = mutateFetcher.state !== "idle";

  return (
    <Layout>
      <Layout.AnnotatedSection title="Team Members">
        <BlockStack gap="400">
          {/* Actions */}
          <InlineStack align="space-between" blockAlign="center">
            <div style={{ maxWidth: "280px", width: "100%" }}>
              <TextField
                label=""
                labelHidden
                placeholder="Search users..."
                value={search}
                onChange={setSearch}
                prefix={<Icon source={SearchIcon} />}
                autoComplete="off"
              />
            </div>
            <Button icon={PlusIcon} onClick={() => setInviteOpen(true)}>
              Invite User
            </Button>
          </InlineStack>

          {/* Users Table */}
          <Card padding="0">
            <IndexTable
              resourceName={{ singular: "user", plural: "users" }}
              itemCount={filtered.length}
              headings={[
                { title: "User" },
                { title: "Role" },
                { title: "Status" },
                { title: "" },
              ]}
              selectable={false}
              loading={listFetcher.state === "loading"}
            >
              {filtered.map((member, index) => (
                <IndexTable.Row id={member.id} key={member.id} position={index} selected={false}>
                  <IndexTable.Cell>
                    <InlineStack gap="300" blockAlign="center">
                      <Avatar initials={getInitials(member.name)} size="sm" />
                      <BlockStack gap="0">
                        <Text as="span" variant="bodyMd" fontWeight="medium">{member.name}</Text>
                        <Text as="span" variant="bodySm" tone="subdued">{member.email}</Text>
                      </BlockStack>
                    </InlineStack>
                  </IndexTable.Cell>
                  <IndexTable.Cell>
                    <Badge tone="info">{member.role}</Badge>
                  </IndexTable.Cell>
                  <IndexTable.Cell>
                    <Badge tone="success">Active</Badge>
                  </IndexTable.Cell>
                  <IndexTable.Cell>
                    <Button
                      icon={DeleteIcon}
                      variant="plain"
                      tone="critical"
                      onClick={() => {
                        if (confirm(`Are you sure you want to remove ${member.name}?`)) {
                            handleRemove(member.id);
                        }
                      }}
                      accessibilityLabel="Remove user"
                    />
                  </IndexTable.Cell>
                </IndexTable.Row>
              ))}
            </IndexTable>
          </Card>
        </BlockStack>
      </Layout.AnnotatedSection>

      {/* Warehouse App */}
      <Layout.AnnotatedSection
        title="Warehouse App"
        description="Download the INK enrollment app for your packing stations."
      >
        <Card>
          <InlineStack gap="600" wrap={false} blockAlign="start">
            <div style={{ width: "120px", height: "120px", border: "1px solid var(--p-color-border)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, background: "var(--p-color-bg-surface-secondary)" }}>
              <svg viewBox="0 0 100 100" style={{ width: "100px", height: "100px" }} aria-label="QR code to download Warehouse App">
                <rect x="5" y="5" width="25" height="25" fill="currentColor" />
                <rect x="35" y="5" width="5" height="5" fill="currentColor" />
                <rect x="45" y="5" width="5" height="5" fill="currentColor" />
                <rect x="55" y="5" width="5" height="5" fill="currentColor" />
                <rect x="70" y="5" width="25" height="25" fill="currentColor" />
                <rect x="10" y="10" width="15" height="15" fill="var(--p-color-bg)" />
                <rect x="75" y="10" width="15" height="15" fill="var(--p-color-bg)" />
                <rect x="13" y="13" width="9" height="9" fill="currentColor" />
                <rect x="78" y="13" width="9" height="9" fill="currentColor" />
                <rect x="5" y="70" width="25" height="25" fill="currentColor" />
                <rect x="10" y="75" width="15" height="15" fill="var(--p-color-bg)" />
                <rect x="13" y="78" width="9" height="9" fill="currentColor" />
              </svg>
            </div>
            <BlockStack gap="400">
              <Text as="p" tone="subdued" variant="bodySm">
                Scan to download the INK Warehouse app on your packing station devices.
              </Text>
              <BlockStack gap="200">
                <InlineStack gap="200">
                  <Text as="span" tone="subdued" variant="bodySm">Store Name:</Text>
                  <Text as="span" variant="bodySm" fontWeight="medium">{storeName}</Text>
                </InlineStack>
                <InlineStack gap="200" blockAlign="center">
                  <Text as="span" tone="subdued" variant="bodySm">Merchant ID:</Text>
                  <code style={{ fontSize: "12px", fontFamily: "monospace", background: "var(--p-color-bg-surface-secondary)", padding: "2px 6px" }}>{merchantId}</code>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(merchantId);
                    }}
                    style={{ background: "none", border: "none", cursor: "pointer", padding: "2px", display: 'flex', alignItems: 'center' }}
                    aria-label="Copy Merchant ID"
                  >
                    <Icon source={ClipboardIcon} tone="subdued" />
                  </button>
                </InlineStack>
              </BlockStack>
              <InlineStack gap="300">
                <Button onClick={() => window.open("https://apps.apple.com/us/app/ink-warehouse/id6670417764", "_blank")} icon={() => <Download size={16} />}>
                  Download App
                </Button>
                <Button variant="plain" onClick={() => window.open("https://warehouse-bee05.web.app/login", "_blank")} icon={() => <ExternalLink size={16} />}>
                  Open App
                </Button>
              </InlineStack>
            </BlockStack>
          </InlineStack>
        </Card>
      </Layout.AnnotatedSection>

      {/* Invite Modal */}
      <Modal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        title="Invite a user"
        primaryAction={{ 
          content: isSubmitting ? "Inviting..." : "Send Invite", 
          onAction: handleInvite, 
          disabled: !inviteEmail || !inviteName || !invitePassword || isSubmitting 
        }}
        secondaryActions={[{ content: "Cancel", onAction: () => setInviteOpen(false) }]}
      >
        <Modal.Section>
          <BlockStack gap="400">
            <TextField
              label="Full name"
              placeholder="Jane Smith"
              value={inviteName}
              onChange={setInviteName}
              autoComplete="name"
            />
            <TextField
              label="Email address"
              type="email"
              placeholder="name@company.com"
              value={inviteEmail}
              onChange={setInviteEmail}
              autoComplete="email"
            />
            <TextField
              label="Password"
              type="password"
              placeholder="••••••••"
              value={invitePassword}
              onChange={setInvitePassword}
              autoComplete="new-password"
            />
            <Select
              label="Role"
              value={inviteRole}
              onChange={setInviteRole}
              options={[
                { label: "Operator", value: "operator" },
              ]}
              disabled
            />
            {mutateFetcher.data?.error && (
              <Text as="p" tone="critical">{mutateFetcher.data.error}</Text>
            )}
          </BlockStack>
        </Modal.Section>
      </Modal>
    </Layout>
  );
};

export default UserManagementSettings;
