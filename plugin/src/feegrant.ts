import { execSync } from 'child_process'
import { homedir } from 'os'
import { join } from 'path'

const MINITIAD = join(homedir(), '.weave', 'data', 'minievm@v1.2.15', 'minitiad')

export function grantFeegrant(granteeInitAddress: string): void {
  execSync(
    `${MINITIAD} tx feegrant grant gas-station ${granteeInitAddress} ` +
    `--chain-id nativ-1 ` +
    `--node http://localhost:26657 ` +
    `--keyring-backend test ` +
    `--home ${join(homedir(), '.minitia')} ` +
    `--gas auto --gas-adjustment 1.4 --yes`,
    { stdio: 'pipe', timeout: 30000 },
  )
}
