import { getSomethingElse } from "./third";

export function getSomething(): string {
    return "somethingAewsome " + getSomethingElse();
}