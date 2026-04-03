// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.23;

contract AgentRegistry {
    struct Agent {
        string name;
        string metadata;
        bytes publicKey;
        uint256 registeredAt;
        bool active;
    }

    mapping(address => Agent) private _agents;
    mapping(string => address) private _nameToAddress;
    address[] private _agentList;
    mapping(address => uint256) private _agentIndex; // 1-indexed for existence check

    error AlreadyRegistered();
    error NotRegistered();
    error NameTaken();
    error EmptyName();

    event AgentRegistered(address indexed agent, string name, string metadata);
    event AgentUpdated(address indexed agent, string metadata);
    event AgentDeregistered(address indexed agent, string name);

    function register(string calldata name, string calldata metadata, bytes calldata publicKey) external {
        if (_agents[msg.sender].active) revert AlreadyRegistered();
        if (bytes(name).length == 0) revert EmptyName();
        if (_nameToAddress[name] != address(0)) revert NameTaken();

        _agents[msg.sender] = Agent({
            name: name,
            metadata: metadata,
            publicKey: publicKey,
            registeredAt: block.timestamp,
            active: true
        });

        _nameToAddress[name] = msg.sender;
        _agentList.push(msg.sender);
        _agentIndex[msg.sender] = _agentList.length; // 1-indexed

        emit AgentRegistered(msg.sender, name, metadata);
    }

    function updateAgent(string calldata metadata, bytes calldata publicKey) external {
        if (!_agents[msg.sender].active) revert NotRegistered();

        _agents[msg.sender].metadata = metadata;
        if (publicKey.length > 0) {
            _agents[msg.sender].publicKey = publicKey;
        }

        emit AgentUpdated(msg.sender, metadata);
    }

    function deregister() external {
        Agent storage agent = _agents[msg.sender];
        if (!agent.active) revert NotRegistered();

        string memory name = agent.name;
        delete _nameToAddress[name];

        // Swap-and-pop from agentList
        uint256 idx = _agentIndex[msg.sender] - 1;
        uint256 lastIdx = _agentList.length - 1;
        if (idx != lastIdx) {
            address lastAgent = _agentList[lastIdx];
            _agentList[idx] = lastAgent;
            _agentIndex[lastAgent] = idx + 1;
        }
        _agentList.pop();
        delete _agentIndex[msg.sender];

        agent.active = false;

        emit AgentDeregistered(msg.sender, name);
    }

    function getAgent(address addr) external view returns (Agent memory) {
        return _agents[addr];
    }

    function getAgentByName(string calldata name) external view returns (address addr, Agent memory agent) {
        addr = _nameToAddress[name];
        agent = _agents[addr];
    }

    function getAgents() external view returns (address[] memory addresses, Agent[] memory agents) {
        uint256 len = _agentList.length;
        addresses = new address[](len);
        agents = new Agent[](len);
        for (uint256 i; i < len; ++i) {
            addresses[i] = _agentList[i];
            agents[i] = _agents[_agentList[i]];
        }
    }

    function isRegistered(address addr) external view returns (bool) {
        return _agents[addr].active;
    }

    function agentCount() external view returns (uint256) {
        return _agentList.length;
    }
}
