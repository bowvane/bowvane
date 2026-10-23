import { createRoot } from "react-dom/client";
import "./styles.css";
import { Little } from "./Little";
import { Overlay } from "./Overlay";
import { Sidebar } from "./Sidebar";

const view = location.hash.slice(1);
document.body.dataset.view = view;
const App = view === "overlay" ? Overlay : view === "little" ? Little : Sidebar;
createRoot(document.getElementById("root")!).render(<App />);
