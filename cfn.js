{
  "Resources": {
    "ECSService": {
      "Type": "AWS::ECS::Service",
      "DependsOn": "ELBListener",
      "Properties": {
        "Cluster": {
          "Ref": "ECSCluster"
        },
        "DesiredCount": "1",
        "LoadBalancers": [
          {
            "ContainerName": "task-01",
            "ContainerPort": 3000,
            "TargetGroupArn": {
              "Ref": "ELBTargetGroup"
            }
          }
        ],
        "Role": {
          "Ref": "ELBServiceRole"
        },
        "TaskDefinition": {
          "Ref": "TaskDefinition"
        }
      }
    },
    "ELBServiceRole": {
      "Type": "AWS::IAM::Role",
      "Properties": {
        "AssumeRolePolicyDocument": {
          "Statement": [
            {
              "Effect": "Allow",
              "Principal": {
                "Service": [
                  "ecs.amazonaws.com"
                ]
              },
              "Action": [
                "sts:AssumeRole"
              ]
            }
          ]
        },
        "Path": "/",
        "Policies": [
          {
            "PolicyName": "ecs-service",
            "PolicyDocument": {
              "Statement": [
                {
                  "Effect": "Allow",
                  "Resource": "*",
                  "Action": [
                    "elasticloadbalancing:DeregisterInstancesFromLoadBalancer",
                    "elasticloadbalancing:DeregisterTargets",
                    "elasticloadbalancing:Describe*",
                    "elasticloadbalancing:RegisterInstancesWithLoadBalancer",
                    "elasticloadbalancing:RegisterTargets",
                    "ec2:Describe*",
                    "ec2:AuthorizeSecurityGroupIngress"
                  ]
                }
              ]
            }
          }
        ]
      }
    },
    "TaskDefinition": {
      "Type": "AWS::ECS::TaskDefinition",
      "Properties": {
        "Family": {
          "Fn::Sub": "${AWS::StackName}-task-01"
        },
        "ContainerDefinitions": [
          {
            "Name": "task-01",
            "Essential": "true",
            "Image": "005213230316.dkr.ecr.ap-southeast-2.amazonaws.com/serverlecs:latest",
            "Memory": 128,
            "LogConfiguration": {
              "LogDriver": "awslogs",
              "Options": {
                "awslogs-group": {
                  "Ref": "CloudwatchLogGroup"
                },
                "awslogs-region": {
                  "Ref": "AWS::Region"
                },
                "awslogs-stream-prefix": {
                  "Ref": "AWS::StackName"
                }
              }
            },
            "PortMappings": [
              {
                "ContainerPort": 3000
              }
            ]
          }
        ]
      }
    },
    "CloudwatchLogGroup": {
      "Type": "AWS::Logs::LogGroup",
      "Properties": {
        "LogGroupName": {
          "Fn::Sub": "serverlecs-${AWS::StackName}"
        },
        "RetentionInDays": 14
      }
    },
    "ServiceScalableTarget": {
      "Type": "AWS::ApplicationAutoScaling::ScalableTarget",
      "DependsOn": "ECSService",
      "Properties": {
        "MaxCapacity": 2,
        "MinCapacity": 1,
        "ResourceId": {
          "Fn::Sub": [
            "service/${ECSCluster}/${ECSServiceName}",
            {
              "ECSServiceName": {
                "Fn::GetAtt": [
                  "ECSService",
                  "Name"
                ]
              }
            }
          ]
        },
        "RoleARN": {
          "Fn::GetAtt": [
            "AutoscalingRole",
            "Arn"
          ]
        },
        "ScalableDimension": "ecs:service:DesiredCount",
        "ServiceNamespace": "ecs"
      }
    },
    "ServiceScalingPolicy": {
      "Type": "AWS::ApplicationAutoScaling::ScalingPolicy",
      "DependsOn": "ServiceScalableTarget",
      "Properties": {
        "PolicyName": "ecs-service-step-scaling-policy",
        "PolicyType": "StepScaling",
        "ScalingTargetId": {
          "Ref": "ServiceScalableTarget"
        },
        "StepScalingPolicyConfiguration": {
          "AdjustmentType": "PercentChangeInCapacity",
          "Cooldown": 60,
          "MetricAggregationType": "Average",
          "StepAdjustments": [
            {
              "MetricIntervalLowerBound": 0,
              "ScalingAdjustment": 200
            }
          ]
        }
      }
    }
  }
}
