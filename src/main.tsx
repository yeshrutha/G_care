import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import "./i18n";

document.documentElement.style.fontSize=({Small:'14px',Medium:'16px',Large:'18px',XL:'20px'} as Record<string,string>)[localStorage.getItem('gcare_font_size') || 'Medium'];
document.documentElement.classList.toggle('high-contrast',localStorage.getItem('gcare_contrast')==='true');
document.documentElement.lang=localStorage.getItem('gcare_language')||'en';
createRoot(document.getElementById("root")!).render(<App />);
