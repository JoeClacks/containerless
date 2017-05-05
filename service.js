"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const _ = require("lodash");
const listener_1 = require("./listener");
class Service {
    constructor(cluster, opts) {
        this.definition = () => {
            let definition = {
                'Name': this.name,
                'Essential': 'true',
                'Image': this.image,
                'Memory': this.memory,
                'Environment': this.environment,
                'LogConfiguration': {
                    'LogDriver': 'awslogs',
                    'Options': {
                        'awslogs-group': {
                            'Ref': this.logGroupName
                        },
                        'awslogs-region': {
                            'Ref': 'AWS::Region'
                        },
                        'awslogs-stream-prefix': {
                            'Ref': 'AWS::StackName'
                        }
                    }
                }
            };
            if (this.port) {
                definition['PortMappings'] = [{ 'ContainerPort': this.port }];
            }
            return [definition];
        };
        this.cluster = cluster;
        this._service = opts.service;
        this._name = opts.name;
        this.tag = opts.tag || this.requireTag();
        this.repository = opts.repository || this.requireRepository();
        this.memory = opts.memory || 128;
        this.count = opts.count || 1;
        this.min_size = opts.min_size || 1;
        this.max_size = opts.max_size || this.min_size + 1;
        this.threshold = opts.threshold || 10;
        this.logGroupRetention = opts.log_group_retention || 7;
        this.environment = _.map(opts.environment, (o) => {
            let [k, v] = _.chain(o).toPairs().flatten().value();
            return { Name: k, Value: v };
        });
        this.port = opts.port;
        this.url = opts.url;
        if (this.port && !this.url)
            this.requireURL();
        if (this.url && !this.port)
            this.requirePort();
        this.listener = new listener_1.Listener(this, cluster);
    }
    requirePort() {
        throw new TypeError('Service definition requires a Port when mapping a URL');
    }
    requireRepository() {
        throw new TypeError('Service definition requires a Repository');
    }
    requireTag() {
        throw new TypeError('Service definition requires a Tag');
    }
    requireURL() {
        throw new TypeError('Service definition requires a URL when mapping a Port');
    }
    get image() {
        return `${this.repository}:${this._name}-${this.tag}`;
    }
    get taskDefinitionName() {
        return `${this.name}TaskDefinition`;
    }
    get logGroupName() {
        return `${this.name}CloudwatchLogGroup`;
    }
    get scalingTargetName() {
        return `${this.name}ScalingTarget`;
    }
    get scalingPolicyName() {
        return `${this.name}ScalingPolicy`;
    }
    get scalingAlarmName() {
        return `${this.name}ALBAlarm`;
    }
    get name() {
        return _.chain(`${this._service}-${this._name}`).camelCase().upperFirst().value();
    }
    generate() {
        let resources = {
            [this.name]: {
                'Type': 'AWS::ECS::Service',
                'DependsOn': [this.cluster.defaultListenerName, this.taskDefinitionName],
                'Properties': {
                    'Cluster': this.cluster.id,
                    'DesiredCount': this.count,
                    'TaskDefinition': {
                        'Ref': this.taskDefinitionName
                    },
                    'LoadBalancers': this.listener.mapping
                }
            },
            [this.taskDefinitionName]: {
                'Type': 'AWS::ECS::TaskDefinition',
                'Properties': {
                    'Family': this.name,
                    'ContainerDefinitions': this.definition()
                }
            },
            [this.logGroupName]: {
                'Type': 'AWS::Logs::LogGroup',
                'Properties': {
                    'LogGroupName': {
                        'Fn::Sub': `${this.name}-\${AWS::StackName}`
                    },
                    'RetentionInDays': this.logGroupRetention
                }
            },
            [this.scalingTargetName]: {
                'Type': 'AWS::ApplicationAutoScaling::ScalableTarget',
                'DependsOn': this.name,
                'Properties': {
                    'MaxCapacity': this.max_size,
                    'MinCapacity': this.min_size,
                    'ScalableDimension': 'ecs:service:DesiredCount',
                    'ServiceNamespace': 'ecs',
                    'ResourceId': {
                        'Fn::Join': [
                            '',
                            [
                                'service/',
                                { 'Ref': 'ContainerlessCluster' },
                                '/',
                                { 'Fn::GetAtt': [this.name, 'Name'] }
                            ]
                        ]
                    },
                    'RoleARN': { 'Fn::GetAtt': ['ContainerlessASGRole', 'Arn'] }
                }
            },
            [this.scalingPolicyName]: {
                'Type': 'AWS::ApplicationAutoScaling::ScalingPolicy',
                'Properties': {
                    'PolicyName': 'ServiceStepPolicy',
                    'PolicyType': 'StepScaling',
                    'ScalingTargetId': {
                        'Ref': this.scalingTargetName
                    },
                    'StepScalingPolicyConfiguration': {
                        'AdjustmentType': 'PercentChangeInCapacity',
                        'Cooldown': 60,
                        'MetricAggregationType': 'Average',
                        'StepAdjustments': [
                            {
                                'MetricIntervalLowerBound': 0,
                                'ScalingAdjustment': 200
                            }
                        ]
                    }
                }
            },
            [this.scalingAlarmName]: {
                'Type': 'AWS::CloudWatch::Alarm',
                'Properties': {
                    'EvaluationPeriods': '1',
                    'Statistic': 'Average',
                    'Threshold': this.threshold,
                    'AlarmDescription': 'ALB HTTP 500 Error Service Alarm',
                    'Period': '60',
                    'AlarmActions': [{ 'Ref': this.scalingPolicyName }],
                    'Namespace': 'AWS/ApplicationELB',
                    'Dimensions': [
                        {
                            'Name': 'ContainerlessService',
                            'Value': {
                                'Ref': this.name
                            }
                        }
                    ],
                    'ComparisonOperator': 'GreaterThanThreshold',
                    'MetricName': 'HTTPCode_ELB_5XX_Count'
                }
            }
        };
        if (this.listener.required()) {
            resources[this.name]['Properties']['Role'] = this.cluster.elbRole;
        }
        let listeners = this.listener.generate();
        return Object.assign(resources, listeners);
        ;
    }
}
exports.Service = Service;
