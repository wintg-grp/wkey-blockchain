import { Contract, type ContractRunner, MaxUint256 } from "ethers";
import type { WintgNetwork } from "../networks.js";
import { ABIS } from "../abis.js";

export interface SwapParams {
  amountIn: bigint;
  minOut: bigint;
  path: string[];
  to: string;
  deadline?: number;
  wallet: ContractRunner;
}

export class DexAdapter {
  constructor(private runner: ContractRunner, private network: WintgNetwork) {}

  private router(runner?: ContractRunner) {
    return new Contract(
      this.network.contracts.WINTGRouter,
      ABIS.WINTGRouter,
      runner ?? this.runner,
    );
  }

  private factory() {
    return new Contract(
      this.network.contracts.WINTGFactory,
      ABIS.WINTGFactory,
      this.runner,
    );
  }

  /// @returns Le montant de tokens reçus pour `amountIn` le long de `path`.
  async getAmountsOut(amountIn: bigint, path: string[]): Promise<bigint[]> {
    return this.router().getAmountsOut(amountIn, path);
  }

  async getPair(tokenA: string, tokenB: string): Promise<string> {
    return this.factory().getPair(tokenA, tokenB);
  }

  async swapExactTokensForTokens(p: SwapParams): Promise<unknown> {
    const dl = p.deadline ?? Math.floor(Date.now() / 1000) + 600;
    return this.router(p.wallet).swapExactTokensForTokens(
      p.amountIn, p.minOut, p.path, p.to, dl,
    );
  }

  async swapExactWTGForTokens(p: Omit<SwapParams, "amountIn"> & { value: bigint }): Promise<unknown> {
    const dl = p.deadline ?? Math.floor(Date.now() / 1000) + 600;
    return this.router(p.wallet).swapExactWTGForTokens(
      p.minOut, p.path, p.to, dl, { value: p.value },
    );
  }

  async swapExactTokensForWTG(p: SwapParams): Promise<unknown> {
    const dl = p.deadline ?? Math.floor(Date.now() / 1000) + 600;
    return this.router(p.wallet).swapExactTokensForWTG(
      p.amountIn, p.minOut, p.path, p.to, dl,
    );
  }
}
