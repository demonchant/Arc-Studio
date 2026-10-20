// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @dev ERC-20 stub whose transfer() and transferFrom() always revert.
///      Used to test SafeERC20-guarded paths in MergePay.
contract FailingERC20 {
    string public name     = "Fail Token";
    string public symbol   = "FAIL";
    uint8  public decimals = 6;

    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    function mint(address to, uint256 amount) external {
        totalSupply += amount;
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    /// @dev Always reverts — SafeERC20 will bubble this up.
    function transfer(address, uint256) external pure returns (bool) {
        revert("FailingERC20: transfer always fails");
    }

    /// @dev Always reverts — SafeERC20 will bubble this up.
    function transferFrom(address, address, uint256) external pure returns (bool) {
        revert("FailingERC20: transferFrom always fails");
    }
}
