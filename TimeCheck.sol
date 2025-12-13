// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract TimeCheck {
    function getTime() public view returns (uint256) {
        return block.timestamp;
    }
}
