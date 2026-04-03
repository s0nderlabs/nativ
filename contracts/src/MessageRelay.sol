// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.23;

contract MessageRelay {
    event Message(address indexed from, address indexed to, bytes payload, uint256 timestamp);

    function sendMessage(address to, bytes calldata payload) external {
        emit Message(msg.sender, to, payload, block.timestamp);
    }

    function sendGroupMessage(address[] calldata recipients, bytes[] calldata payloads) external {
        require(recipients.length == payloads.length, "length mismatch");
        for (uint256 i; i < recipients.length; ++i) {
            emit Message(msg.sender, recipients[i], payloads[i], block.timestamp);
        }
    }
}
