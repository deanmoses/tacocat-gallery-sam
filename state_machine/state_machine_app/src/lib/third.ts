import { getSomethingCommon } from "../layers/commons";

export function getSomethingElse(): string {
    return "somethingElse " + getSomethingCommon();
}