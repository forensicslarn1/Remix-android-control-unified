import { Switch, Route } from "wouter";
import Home from "./pages/Home";
import { Toaster } from "sonner";
import { ThemeProvider } from "./contexts/ThemeContext";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route component={Home} />
    </Switch>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <Router />
      <Toaster position="bottom-right" richColors />
    </ThemeProvider>
  );
}
