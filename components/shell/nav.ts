import AccountBalanceOutlined from "@mui/icons-material/AccountBalanceOutlined";
import CodeOutlined from "@mui/icons-material/CodeOutlined";
import CreditCardOutlined from "@mui/icons-material/CreditCardOutlined";
import DashboardOutlined from "@mui/icons-material/DashboardOutlined";
import InsightsOutlined from "@mui/icons-material/InsightsOutlined";
import PowerOutlined from "@mui/icons-material/PowerOutlined";
import RuleOutlined from "@mui/icons-material/RuleOutlined";
import SettingsOutlined from "@mui/icons-material/SettingsOutlined";
import StorefrontOutlined from "@mui/icons-material/StorefrontOutlined";
import type { SvgIconComponent } from "@mui/icons-material";

export interface NavItem { href: string; label: string; icon: SvgIconComponent }
export const NAV: { group: string; items: NavItem[] }[] = [
  { group: "Workspace", items: [
    { href: "/", label: "Dashboard", icon: DashboardOutlined },
    { href: "/payments", label: "Payments", icon: CreditCardOutlined },
    { href: "/merchants", label: "Merchants", icon: StorefrontOutlined },
    { href: "/connectors", label: "Connectors", icon: PowerOutlined },
  ] },
  { group: "Insights", items: [
    { href: "/analytics", label: "Analytics", icon: InsightsOutlined },
    { href: "/reconciliation", label: "Reconciliation", icon: RuleOutlined },
  ] },
  { group: "Build", items: [
    { href: "/developers", label: "Developers", icon: CodeOutlined },
    { href: "/settings", label: "Settings", icon: SettingsOutlined },
  ] },
];
export const BrandIcon = AccountBalanceOutlined;
export const isActive = (href: string, path: string) => (href === "/" ? path === "/" : path === href || path.startsWith(`${href}/`));
