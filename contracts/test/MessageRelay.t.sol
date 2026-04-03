// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.23;

import {Test} from "forge-std/Test.sol";
import {MessageRelay} from "../src/MessageRelay.sol";

contract MessageRelayTest is Test {
    MessageRelay relay;
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    address charlie = makeAddr("charlie");

    function setUp() public {
        relay = new MessageRelay();
    }

    function test_sendMessage() public {
        vm.expectEmit(true, true, false, true);
        emit MessageRelay.Message(alice, bob, hex"deadbeef", block.timestamp);

        vm.prank(alice);
        relay.sendMessage(bob, hex"deadbeef");
    }

    function test_sendGroupMessage() public {
        address[] memory recipients = new address[](2);
        recipients[0] = bob;
        recipients[1] = charlie;

        bytes[] memory payloads = new bytes[](2);
        payloads[0] = hex"aabb";
        payloads[1] = hex"ccdd";

        vm.prank(alice);
        relay.sendGroupMessage(recipients, payloads);
    }

    function test_sendGroupMessage_revert_lengthMismatch() public {
        address[] memory recipients = new address[](2);
        recipients[0] = bob;
        recipients[1] = charlie;

        bytes[] memory payloads = new bytes[](1);
        payloads[0] = hex"aabb";

        vm.expectRevert("length mismatch");
        vm.prank(alice);
        relay.sendGroupMessage(recipients, payloads);
    }
}
