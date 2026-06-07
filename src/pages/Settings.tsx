import { useSearchParams } from "react-router-dom";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import BrandsManager from "@/components/settings/BrandsManager";
import AdminTemplates from "./AdminTemplates";
import AdminTeam from "./AdminTeam";
import SettingsIntegrations from "./SettingsIntegrations";
import ProfileSettings from "@/components/settings/ProfileSettings";
import ActivityTab from "@/components/settings/ActivityTab";
import AlertsTab from "@/components/settings/AlertsTab";
import { useAuth } from "@/contexts/AuthContext";

const ACTIVITY_EMAIL = "marc.alex.beatty@gmail.com";

export default function Settings() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get("tab") || "profile";
  const { user, accessLevel } = useAuth();
  const showActivity = user?.email === ACTIVITY_EMAIL;

  // Non-admins only see Profile tab
  if (accessLevel !== "admin") {
    return (
      <div className="space-y-6">
        <h1 className="text-xl font-semibold text-foreground">Settings</h1>
        <ProfileSettings />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-foreground">Settings</h1>
      <Tabs value={activeTab} onValueChange={(v) => setSearchParams({ tab: v })}>
        <TabsList>
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="brands">Brands</TabsTrigger>
          <TabsTrigger value="templates">Templates</TabsTrigger>
          <TabsTrigger value="team">Team Members</TabsTrigger>
          <TabsTrigger value="integrations">Integrations</TabsTrigger>
          <TabsTrigger value="alerts">Alerts</TabsTrigger>
          {showActivity && <TabsTrigger value="activity">Activity</TabsTrigger>}
        </TabsList>
        <TabsContent value="profile" className="mt-6">
          <ProfileSettings />
        </TabsContent>
        <TabsContent value="brands" className="mt-6">
          <BrandsManager />
        </TabsContent>
        <TabsContent value="templates" className="mt-6">
          <AdminTemplates embedded />
        </TabsContent>
        <TabsContent value="team" className="mt-6">
          <AdminTeam embedded />
        </TabsContent>
        <TabsContent value="integrations" className="mt-6">
          <SettingsIntegrations />
        </TabsContent>
        <TabsContent value="alerts" className="mt-6">
          <AlertsTab />
        </TabsContent>
        {showActivity && (
          <TabsContent value="activity" className="mt-6">
            <ActivityTab />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
