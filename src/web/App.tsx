import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Landing } from "./pages/Landing";
import { Join } from "./pages/Join";
import { Login } from "./pages/Login";
import { Recover } from "./pages/Recover";
import { RecoveryCode } from "./pages/RecoveryCode";
import { Signup } from "./pages/Signup";
import { Onboard } from "./pages/Onboard";
import { VillaHome } from "./pages/VillaHome";
import { VillaNew } from "./pages/VillaNew";
import { Certify } from "./pages/Certify";

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/signup/code" element={<RecoveryCode />} />
        <Route path="/login" element={<Login />} />
        <Route path="/recover" element={<Recover />} />
        <Route path="/villa/new" element={<VillaNew />} />
        <Route path="/join/:token" element={<Join />} />
        <Route path="/onboard" element={<Onboard />} />
        <Route path="/villa" element={<VillaHome />} />
        <Route path="/certify" element={<Certify />} />
      </Routes>
    </BrowserRouter>
  );
}
