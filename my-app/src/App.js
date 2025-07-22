import { BrowserRouter as Router, Routes, Route, NavLink } from "react-router-dom";
import StrategyDashboard from "./components/StrategyDashboard";
import LiveTrading from "./components/LiveTrading";

function App() {
  return (
    <Router>
      <div style={{ background: "#1e293b", minHeight: "100vh", color: "#f8fafc" }}>
        <nav style={{ 
          padding: "20px", 
          background: "#0f172a", 
          borderBottom: "1px solid #334155",
          display: "flex",
          gap: "20px"
        }}>
          <NavLink
            to="/"
            end
            style={({ isActive }) => ({
              display: "inline-flex",
              alignItems: "center",
              fontWeight: "bold",
              fontSize: 15,
              padding: "7px 16px",
              borderRadius: "8px",
              background: isActive ? "#4f7cf7" : "#1e293b",
              color: isActive ? "#fff" : "#f8fafc",
              boxShadow: isActive ? "0 2px 8px rgba(79,124,247,0.15)" : "none",
              border: isActive ? "2px solid #4f7cf7" : "2px solid transparent",
              textDecoration: "none",
              transition: "all 0.15s"
            })}
          >
            Backtesting
          </NavLink>
          <NavLink
            to="/live"
            style={({ isActive }) => ({
              display: "inline-flex",
              alignItems: "center",
              fontWeight: "bold",
              fontSize: 15,
              padding: "7px 16px",
              borderRadius: "8px",
              background: isActive ? "#4f7cf7" : "#1e293b",
              color: isActive ? "#fff" : "#f8fafc",
              boxShadow: isActive ? "0 2px 8px rgba(79,124,247,0.15)" : "none",
              border: isActive ? "2px solid #4f7cf7" : "2px solid transparent",
              textDecoration: "none",
              transition: "all 0.15s"
            })}
          >
            Live Trading
          </NavLink>
        </nav>

        <Routes>
          <Route path="/" element={<StrategyDashboard />} />
          <Route path="/live" element={<LiveTrading />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
