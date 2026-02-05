// Demo AlphaWise PortfolioPanel wrapper
// Uses the investing app's PortfolioPanel with demo API path for separate database
import { PortfolioPanel as InvestingPortfolioPanel } from '../../investing/panels/PortfolioPanel';

export function PortfolioPanel() {
  return <InvestingPortfolioPanel apiBasePath="/api/demo" />;
}
