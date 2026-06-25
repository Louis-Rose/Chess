import { AgentSearch } from './AgentSearch';

// The Find tab: the shopping agent. Dressing guides live in the How to tab.
export function ClothingHome() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
      <AgentSearch />
    </div>
  );
}
