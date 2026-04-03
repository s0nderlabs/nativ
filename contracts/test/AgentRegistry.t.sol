// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.23;

import {Test} from "forge-std/Test.sol";
import {AgentRegistry} from "../src/AgentRegistry.sol";

contract AgentRegistryTest is Test {
    AgentRegistry registry;
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");

    function setUp() public {
        registry = new AgentRegistry();
    }

    function test_register() public {
        vm.prank(alice);
        registry.register("atlas", '{"desc":"research agent"}', hex"04abcd");

        AgentRegistry.Agent memory agent = registry.getAgent(alice);
        assertEq(agent.name, "atlas");
        assertEq(agent.metadata, '{"desc":"research agent"}');
        assertEq(agent.publicKey, hex"04abcd");
        assertTrue(agent.active);
        assertEq(registry.agentCount(), 1);
    }

    function test_register_emitsEvent() public {
        vm.expectEmit(true, false, false, true);
        emit AgentRegistry.AgentRegistered(alice, "atlas", "meta");

        vm.prank(alice);
        registry.register("atlas", "meta", hex"04");
    }

    function test_register_revert_alreadyRegistered() public {
        vm.prank(alice);
        registry.register("atlas", "", hex"");

        vm.expectRevert(AgentRegistry.AlreadyRegistered.selector);
        vm.prank(alice);
        registry.register("atlas2", "", hex"");
    }

    function test_register_revert_nameTaken() public {
        vm.prank(alice);
        registry.register("atlas", "", hex"");

        vm.expectRevert(AgentRegistry.NameTaken.selector);
        vm.prank(bob);
        registry.register("atlas", "", hex"");
    }

    function test_register_revert_emptyName() public {
        vm.expectRevert(AgentRegistry.EmptyName.selector);
        vm.prank(alice);
        registry.register("", "", hex"");
    }

    function test_getAgentByName() public {
        vm.prank(alice);
        registry.register("atlas", "meta", hex"04");

        (address addr, AgentRegistry.Agent memory agent) = registry.getAgentByName("atlas");
        assertEq(addr, alice);
        assertEq(agent.name, "atlas");
    }

    function test_updateAgent() public {
        vm.prank(alice);
        registry.register("atlas", "v1", hex"04");

        vm.prank(alice);
        registry.updateAgent("v2", hex"05");

        AgentRegistry.Agent memory agent = registry.getAgent(alice);
        assertEq(agent.metadata, "v2");
        assertEq(agent.publicKey, hex"05");
    }

    function test_updateAgent_keepPublicKey() public {
        vm.prank(alice);
        registry.register("atlas", "v1", hex"04abcd");

        vm.prank(alice);
        registry.updateAgent("v2", hex"");

        AgentRegistry.Agent memory agent = registry.getAgent(alice);
        assertEq(agent.publicKey, hex"04abcd");
    }

    function test_updateAgent_revert_notRegistered() public {
        vm.expectRevert(AgentRegistry.NotRegistered.selector);
        vm.prank(alice);
        registry.updateAgent("v2", hex"");
    }

    function test_deregister() public {
        vm.prank(alice);
        registry.register("atlas", "", hex"");

        vm.prank(alice);
        registry.deregister();

        assertFalse(registry.isRegistered(alice));
        assertEq(registry.agentCount(), 0);

        (address addr,) = registry.getAgentByName("atlas");
        assertEq(addr, address(0));
    }

    function test_deregister_nameFreed() public {
        vm.prank(alice);
        registry.register("atlas", "", hex"");

        vm.prank(alice);
        registry.deregister();

        vm.prank(bob);
        registry.register("atlas", "", hex"");

        assertTrue(registry.isRegistered(bob));
    }

    function test_getAgents() public {
        vm.prank(alice);
        registry.register("atlas", "", hex"");

        vm.prank(bob);
        registry.register("cipher", "", hex"");

        (address[] memory addrs, AgentRegistry.Agent[] memory agents) = registry.getAgents();
        assertEq(addrs.length, 2);
        assertEq(agents[0].name, "atlas");
        assertEq(agents[1].name, "cipher");
    }

    function test_getAgents_afterDeregister() public {
        vm.prank(alice);
        registry.register("atlas", "", hex"");

        vm.prank(bob);
        registry.register("cipher", "", hex"");

        vm.prank(alice);
        registry.deregister();

        (address[] memory addrs,) = registry.getAgents();
        assertEq(addrs.length, 1);
        assertEq(addrs[0], bob);
    }

    function test_isRegistered() public {
        assertFalse(registry.isRegistered(alice));

        vm.prank(alice);
        registry.register("atlas", "", hex"");

        assertTrue(registry.isRegistered(alice));
    }
}
