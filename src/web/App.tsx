import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Landing } from "./pages/Landing";
import { Login } from "./pages/Login";
import { Recover } from "./pages/Recover";
import { RecoveryCode } from "./pages/RecoveryCode";
import { Signup } from "./pages/Signup";

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/signup/code" element={<RecoveryCode />} />
        <Route path="/login" element={<Login />} />
        <Route path="/recover" element={<Recover />} />
      </Routes>
    </BrowserRouter>
  );
}
